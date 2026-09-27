import { Router } from "express";
import multer from "multer";
import { GoogleGenAI, Type, ApiError } from "@google/genai";

export const receiptsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

const ACCEPTED_MIMETYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const ITEMS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description:
              "a plain, singular grocery-ingredient name (lowercase, no brand, no store SKU/code, " +
              "no packaging size) - e.g. a line reading 'GV 2% MILK 2L' becomes 'milk', 'ORG " +
              "BANANA' becomes 'banana'.",
          },
          quantity: {
            type: Type.NUMBER,
            description: "the count/weight bought, from the line if printed (e.g. '3 @ 1.29' -> 3). Omit if not shown.",
          },
        },
        required: ["name"],
      },
    },
  },
  required: ["items"],
};

// POST /api/receipts/parse - upload a grocery receipt photo or PDF; Gemini
// reads it and returns candidate item names for the pantry inventory. This
// only extracts and returns items - nothing is saved here, since OCR'd
// receipt text is noisy enough (store fees, coupons, loyalty lines) that a
// human review/edit/select step before anything hits the database is worth
// the extra click. Non-food lines (tax, tips, bag fees, subtotals) are
// asked to be excluded up front, though the review step is the real
// backstop for whatever slips through.
receiptsRouter.post("/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "file is required" });
  }
  if (!ACCEPTED_MIMETYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: "file must be a PDF, JPG, PNG, or WebP" });
  }

  try {
    const client = new GoogleGenAI({});
    const response = await client.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          inlineData: {
            data: req.file.buffer.toString("base64"),
            mimeType: req.file.mimetype,
          },
        },
        "This is a grocery store receipt (photo or scanned/exported PDF), possibly in French, " +
          "English, or another language. List every food/grocery item that was bought, as a plain " +
          "singular ingredient name suitable for a recipe (strip brand names, store codes, and " +
          "package-size text - e.g. 'PC ORG CHKN BRST 900G' -> 'chicken breast'). Include the " +
          "quantity if the line shows one. Do NOT include tax, tips, bottle/bag deposits, " +
          "subtotals/totals, payment info, loyalty-point lines, or coupons/discounts as items.",
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: ITEMS_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);
    if (!parsed || !Array.isArray(parsed.items)) {
      return res.status(502).json({ error: "Could not read any items from this receipt." });
    }

    const items = parsed.items
      .filter((it) => it.name && it.name.trim())
      .map((it) => ({
        name: it.name.trim(),
        quantity: typeof it.quantity === "number" && it.quantity > 0 ? it.quantity : null,
      }));

    if (items.length === 0) {
      return res.status(502).json({ error: "Could not read any items from this receipt." });
    }

    res.json({ items });
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
    console.error("Receipt parse failed:", err);
    res.status(500).json({ error: "Failed to process receipt." });
  }
});
