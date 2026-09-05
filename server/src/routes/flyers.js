import { Router } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "../lib/prisma.js";

export const flyersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 }, // matches Claude's 32MB PDF request limit
});

const CATEGORIES = ["protein", "produce", "dairy", "bakery", "staple", "other"];

const ExtractedDealsSchema = z.object({
  deals: z.array(
    z.object({
      item: z.string(),
      price: z.string(),
      category: z.enum(CATEGORIES),
      validUntil: z.string().nullable(),
    }),
  ),
});

// POST /api/flyers/upload - upload a grocery flyer PDF for one store; Claude
// reads it and extracts structured deals, which replace that store's
// previous rows outright (a new flyer supersedes the old one).
flyersRouter.post("/upload", upload.single("pdf"), async (req, res) => {
  const { store } = req.body;
  if (!store || !store.trim()) {
    return res.status(400).json({ error: "store is required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "pdf file is required" });
  }
  if (req.file.mimetype !== "application/pdf") {
    return res.status(400).json({ error: "file must be a PDF" });
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system:
        "You extract grocery flyer specials from a scanned/printed flyer PDF. " +
        "List every distinct priced item you can read. For each: a short item " +
        "name as printed (e.g. 'Boneless chicken breast'), the price exactly as " +
        "printed including any unit (e.g. '$4.99/lb', '2 for $5'), a category " +
        `(one of: ${CATEGORIES.join(", ")}), and the flyer's stated valid-until ` +
        "date as YYYY-MM-DD if one is printed on the flyer, else null. Do not " +
        "invent items or prices that aren't legible.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: req.file.buffer.toString("base64"),
              },
            },
            { type: "text", text: "Extract this flyer's deals." },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ExtractedDealsSchema) },
    });

    if (!response.parsed_output) {
      return res.status(502).json({ error: "Could not extract deals from this PDF." });
    }

    const storeName = store.trim();
    const { deals } = response.parsed_output;

    await prisma.$transaction([
      prisma.flyerDeal.deleteMany({ where: { store: storeName } }),
      prisma.flyerDeal.createMany({
        data: deals.map((d) => ({ ...d, store: storeName })),
      }),
    ]);

    res.status(201).json({ store: storeName, count: deals.length });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic authentication error:", err.message);
      return res.status(502).json({
        error: "Server is missing a valid ANTHROPIC_API_KEY. Ask the app owner to configure it.",
      });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Rate limited by Claude API - try again shortly." });
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Anthropic bad request:", err.message);
      return res.status(400).json({ error: "Claude API rejected this PDF: " + err.message });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err.message);
      return res.status(502).json({ error: "Claude API error: " + err.message });
    }
    console.error("Flyer upload failed:", err);
    res.status(500).json({ error: "Failed to process flyer." });
  }
});
