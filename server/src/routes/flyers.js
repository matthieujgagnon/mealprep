import { Router } from "express";
import multer from "multer";
import { GoogleGenAI, Type, ApiError } from "@google/genai";
import { prisma } from "../lib/prisma.js";

export const flyersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

const CATEGORIES = ["protein", "produce", "dairy", "bakery", "staple", "other"];

// Gemini's structured-output schema has no "nullable" support here, so
// validUntil comes back as "" (not null) when the flyer has no printed
// date - converted to a real null before it hits the DB.
const DEALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    deals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          price: { type: Type.STRING },
          category: { type: Type.STRING, enum: CATEGORIES },
          validUntil: {
            type: Type.STRING,
            description: "YYYY-MM-DD if the flyer states a valid-until date, else an empty string",
          },
        },
        required: ["item", "price", "category", "validUntil"],
      },
    },
  },
  required: ["deals"],
};

// POST /api/flyers/upload - upload a grocery flyer PDF for one store; Gemini
// (free tier - see GEMINI_API_KEY below) reads it and extracts structured
// deals, which replace that store's previous rows outright (a new flyer
// supersedes the old one).
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
    const client = new GoogleGenAI({});
    const response = await client.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          inlineData: {
            data: req.file.buffer.toString("base64"),
            mimeType: "application/pdf",
          },
        },
        "You extract grocery flyer specials from a scanned/printed flyer PDF. " +
          "List every distinct priced item you can read. For each: a short item " +
          "name as printed (e.g. 'Boneless chicken breast'), the price exactly as " +
          "printed including any unit (e.g. '$4.99/lb', '2 for $5'), a category, " +
          "and the flyer's stated valid-until date if one is printed. Do not " +
          "invent items or prices that aren't legible.",
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: DEALS_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);
    if (!parsed || !Array.isArray(parsed.deals)) {
      return res.status(502).json({ error: "Could not extract deals from this PDF." });
    }

    const storeName = store.trim();
    const deals = parsed.deals.map((d) => ({
      item: d.item,
      price: d.price,
      category: CATEGORIES.includes(d.category) ? d.category : "other",
      validUntil: d.validUntil || null,
    }));

    await prisma.$transaction([
      prisma.flyerDeal.deleteMany({ where: { store: storeName } }),
      prisma.flyerDeal.createMany({
        data: deals.map((d) => ({ ...d, store: storeName })),
      }),
    ]);

    res.status(201).json({ store: storeName, count: deals.length });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        console.error("Gemini authentication error:", err.message);
        return res.status(502).json({
          error: "Server is missing a valid GEMINI_API_KEY. Ask the app owner to configure it.",
        });
      }
      if (err.status === 429) {
        return res.status(429).json({ error: "Rate limited by the Gemini API - try again shortly." });
      }
      console.error("Gemini API error:", err.status, err.message);
      return res.status(502).json({ error: "Gemini API error: " + err.message });
    }
    console.error("Flyer upload failed:", err);
    res.status(500).json({ error: "Failed to process flyer." });
  }
});
