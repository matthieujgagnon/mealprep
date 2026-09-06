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
          matchName: {
            type: Type.STRING,
            description:
              "item translated to a plain English grocery-ingredient name (lowercase, no brand, " +
              "no cut/packaging detail beyond what a recipe would name it - e.g. 'brocoli' -> " +
              "'broccoli', 'poitrine de poulet désossée' -> 'chicken breast'). If item is already " +
              "in English, repeat it here in the same simplified form.",
          },
          price: { type: Type.STRING },
          unitPrice: {
            type: Type.NUMBER,
            description:
              "price reduced to a single number per one unitBasis unit, doing any multi-buy or " +
              "package-size math yourself (e.g. '2 for $5' -> 2.5, '900g for $1.99' converted to " +
              "price per lb, '$3.49 each' -> 3.49). Omit entirely (do not guess or default to 0) " +
              "if the printed price can't be confidently reduced to one number this way.",
          },
          unitBasis: {
            type: Type.STRING,
            enum: ["lb", "each", "L"],
            description:
              "the unit unitPrice is expressed in - 'lb' for anything priced by weight (convert " +
              "kg/g/oz to lb), 'L' for anything priced by volume (convert mL to L), 'each' for " +
              "anything priced by count/piece. Omit alongside unitPrice if omitted.",
          },
          category: { type: Type.STRING, enum: CATEGORIES },
          validUntil: {
            type: Type.STRING,
            description: "YYYY-MM-DD if the flyer states a valid-until date, else an empty string",
          },
        },
        required: ["item", "matchName", "price", "category", "validUntil"],
      },
    },
  },
  required: ["deals"],
};

// Renders every page of an uploaded flyer PDF to a PNG buffer, so the
// Flyers tab can show the actual flyer layout alongside the AI-extracted
// deal text. Uses pdfjs-dist's Node ("legacy") build with @napi-rs/canvas
// standing in for the browser <canvas> it normally draws into - chosen over
// alternatives (node-canvas, poppler binaries) because it ships prebuilt
// native binaries, avoiding a system-package dependency on Render.
//
// Both are loaded here via dynamic import, not a top-level static import,
// specifically so a missing/incompatible prebuilt native binary on the
// deploy platform throws inside this function - already wrapped in a
// try/catch by the one caller below - rather than at module load time,
// which would crash the whole server on startup and take down every route,
// not just uploads (this is a from-production fix: exactly that happened).
async function renderPdfPages(buffer) {
  const [{ createCanvas }, pdfjsLib] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      // pdfjs asks the canvas factory for extra offscreen canvases (e.g. for
      // masks/patterns) during rendering - @napi-rs/canvas isn't a DOM
      // canvas so it needs this adapter rather than pdfjs's browser default.
      canvasFactory: {
        create(width, height) {
          const c = createCanvas(width, height);
          return { canvas: c, context: c.getContext("2d") };
        },
        reset(canvasAndContext, width, height) {
          canvasAndContext.canvas.width = width;
          canvasAndContext.canvas.height = height;
        },
        destroy() {},
      },
    }).promise;
    pages.push(await canvas.encode("png"));
  }
  return pages;
}

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
        "You extract grocery flyer specials from a scanned/printed flyer PDF, " +
          "which may be in French, English, or another language. List every " +
          "distinct priced item you can read. For each: a short item name as " +
          "printed on the flyer (e.g. 'Boneless chicken breast' or 'Brocoli'), " +
          "an English translation of that name for ingredient matching (see " +
          "matchName below), the price exactly as printed including any unit " +
          "(e.g. '$4.99/lb', '2 for $5'), that same price reduced to one " +
          "comparable per-unit number (see unitPrice/unitBasis below) when " +
          "you can do so confidently, a category, and the flyer's stated " +
          "valid-until date if one is printed. Do not invent items or prices " +
          "that aren't legible.",
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

    const UNIT_BASES = ["lb", "each", "L"];
    const storeName = store.trim();
    const deals = parsed.deals.map((d) => {
      // A confident unitPrice requires a matching unitBasis too - either
      // both are usable or neither is, since a bare number with no unit
      // can't be compared against anything.
      const hasUnitPrice = typeof d.unitPrice === "number" && d.unitPrice > 0 && UNIT_BASES.includes(d.unitBasis);
      return {
        item: d.item,
        matchName: d.matchName || d.item,
        price: d.price,
        unitPrice: hasUnitPrice ? d.unitPrice : null,
        unitBasis: hasUnitPrice ? d.unitBasis : null,
        category: CATEGORIES.includes(d.category) ? d.category : "other",
        validUntil: d.validUntil || null,
      };
    });

    // Best-effort: page thumbnails are a nice-to-have on top of the
    // already-extracted deals, so a rendering failure (e.g. an unusual PDF
    // structure) shouldn't fail the whole upload.
    let pageImages = [];
    try {
      pageImages = await renderPdfPages(req.file.buffer);
    } catch (err) {
      console.error("Flyer page rendering failed (deals still saved):", err);
    }

    await prisma.$transaction([
      prisma.flyerDeal.deleteMany({ where: { store: storeName } }),
      prisma.flyerDeal.createMany({
        data: deals.map((d) => ({ ...d, store: storeName })),
      }),
      prisma.flyerPage.deleteMany({ where: { store: storeName } }),
      ...(pageImages.length > 0
        ? [
            prisma.flyerPage.createMany({
              data: pageImages.map((image, i) => ({ store: storeName, page: i + 1, image })),
            }),
          ]
        : []),
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

// GET /api/flyers/pages/:id/image - serves one rendered flyer-page PNG.
// Cached hard since a page's image never changes once created (a re-upload
// creates new FlyerPage rows with new ids rather than mutating this one).
flyersRouter.get("/pages/:id/image", async (req, res) => {
  const page = await prisma.flyerPage.findUnique({ where: { id: req.params.id } });
  if (!page) return res.status(404).end();
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(page.image);
});

// DELETE /api/flyers - clear every uploaded flyer's deals at once (e.g. to
// drop stale rows extracted before a matching fix, without re-uploading
// each store one at a time).
flyersRouter.delete("/", async (req, res) => {
  await prisma.$transaction([prisma.flyerDeal.deleteMany({}), prisma.flyerPage.deleteMany({})]);
  res.status(204).send();
});
