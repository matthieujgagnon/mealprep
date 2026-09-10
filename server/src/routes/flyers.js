import { Router } from "express";
import multer from "multer";
import { GoogleGenAI, Type, ApiError } from "@google/genai";
import { prisma } from "../lib/prisma.js";
import { parseLeRabaisMarkdown, mapToFlyerDeals } from "../lib/leRabais.js";

export const flyersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

// PDF for a normal single-store flyer, or a photo/screenshot for anything
// else worth extracting deals from (e.g. a curated weekly roundup image
// posted by someone else, rather than a store's own flyer).
const ACCEPTED_MIMETYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

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
          store: {
            type: Type.STRING,
            description:
              "the specific grocery store this item's price is attributed to - ONLY when this " +
              "image mixes deals from several different stores (e.g. a curated weekly roundup " +
              "graphic) and a label, logo, or caption names which store this particular item is " +
              "from. Omit entirely for a normal single-store flyer where every item is already " +
              "from the same store - do not repeat or guess a store name in that case.",
          },
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
// UNUSED for now - see the comment at its one former call site below. Left
// defined rather than deleted since the dynamic-import structure here is
// still the right shape once the underlying native-crash issue is
// resolved; just not safe to call in production yet.
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

// POST /api/flyers/upload - upload a grocery flyer PDF, or a photo/screenshot
// of one (e.g. a curated weekly deals roundup someone else posted) for a
// named source; Gemini (free tier - see GEMINI_API_KEY below) reads it and
// extracts structured deals, which replace that source's previous rows
// outright (a new upload supersedes the old one under the same source).
flyersRouter.post("/upload", upload.single("file"), async (req, res) => {
  const { store } = req.body;
  if (!store || !store.trim()) {
    return res.status(400).json({ error: "store is required" });
  }
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
        "You extract grocery flyer specials from a scanned/printed flyer, or " +
          "from a photo/screenshot of one (which may show a single store's " +
          "flyer, or a curated roundup image mixing deals from several " +
          "different stores) - which may be in French, English, or another " +
          "language. List every distinct priced item you can read. For each: " +
          "a short item name as printed (e.g. 'Boneless chicken breast' or " +
          "'Brocoli'), which store it's from if the image mixes several (see " +
          "store below), an English translation of that name for ingredient " +
          "matching (see matchName below), the price exactly as printed " +
          "including any unit (e.g. '$4.99/lb', '2 for $5'), that same price " +
          "reduced to one comparable per-unit number (see " +
          "unitPrice/unitBasis below) when you can do so confidently, a " +
          "category, and the stated valid-until date if one is printed. Do " +
          "not invent items or prices that aren't legible.",
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: DEALS_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);
    if (!parsed || !Array.isArray(parsed.deals)) {
      return res.status(502).json({ error: "Could not extract deals from this file." });
    }

    const UNIT_BASES = ["lb", "each", "L"];
    // `source` identifies this upload for replace-on-reupload purposes (the
    // name typed in the form - "Metro," or "Le Rabais" for a recurring
    // multi-store roundup). `store` is the actual store each item's price is
    // from - per-item when Gemini could tell them apart, else the source
    // name, which is the same value for a normal single-store flyer.
    const source = store.trim();
    const deals = parsed.deals.map((d) => {
      // A confident unitPrice requires a matching unitBasis too - either
      // both are usable or neither is, since a bare number with no unit
      // can't be compared against anything.
      const hasUnitPrice = typeof d.unitPrice === "number" && d.unitPrice > 0 && UNIT_BASES.includes(d.unitBasis);
      return {
        item: d.item,
        userId: req.userId,
        store: (d.store && d.store.trim()) || source,
        source,
        matchName: d.matchName || d.item,
        price: d.price,
        unitPrice: hasUnitPrice ? d.unitPrice : null,
        unitBasis: hasUnitPrice ? d.unitBasis : null,
        category: CATEGORIES.includes(d.category) ? d.category : "other",
        validUntil: d.validUntil || null,
      };
    });

    // Temporarily disabled: rendering flyer pages to thumbnails via
    // @napi-rs/canvas was taking down every upload in production with a raw,
    // unhandled-crash-style failure (no error body at all) that a JS
    // try/catch around renderPdfPages did not prevent - consistent with a
    // native-code crash (e.g. a missing system graphics library on the
    // deploy platform) rather than a catchable JS exception, since that
    // kind of failure kills the process before JS error handling ever runs.
    // Deals-only upload worked reliably for weeks before this was added, so
    // it's off until the rendering step can be proven safe outside a JS
    // try/catch (page-count/size limits, isolating it from the main
    // process, or verifying the native binary's runtime deps on Render).
    const pageImages = [];

    await prisma.$transaction([
      // Scoped to this user first and foremost - without that, two accounts
      // both typing "Metro" would delete/see each other's deals. Also
      // matches pre-migration rows (source null, store equal to what's now
      // the source name) so re-uploading a store that already has old rows
      // from before `source` existed replaces them too, rather than leaving
      // them stranded forever - that legacy case only ever applies to
      // whichever account inherited the pre-account data (see auth.js).
      prisma.flyerDeal.deleteMany({
        where: { userId: req.userId, OR: [{ source }, { source: null, store: source }] },
      }),
      prisma.flyerDeal.createMany({ data: deals }),
      prisma.flyerPage.deleteMany({ where: { userId: req.userId, store: source } }),
      ...(pageImages.length > 0
        ? [
            prisma.flyerPage.createMany({
              data: pageImages.map((image, i) => ({ userId: req.userId, store: source, page: i + 1, image })),
            }),
          ]
        : []),
    ]);

    res.status(201).json({ store: source, count: deals.length });
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

// Le Rabais (lerabais.com) publishes a pre-compiled table of current grocery
// deals across several Montreal-area stores, itself pulled from Flipp - see
// server/src/lib/leRabais.js for how that file is parsed. This bypasses the
// PDF/photo upload path (and the Gemini call it relies on) entirely: the
// data's already structured and the per-lb prices are already computed, so
// there's nothing to OCR or guess.
const LE_RABAIS_URL = "https://lerabais.com/Liste/Tableau.md";
const LE_RABAIS_SOURCE = "Le Rabais";
const MONTREAL_POSTAL_CODE = "H2T2S3";

// POST /api/flyers/import-le-rabais - fetches and imports this week's deals
// from Le Rabais. Re-running it replaces its own previous rows only (scoped
// by source, same as a re-upload under the same name), leaving any manually
// uploaded flyers untouched.
flyersRouter.post("/import-le-rabais", async (req, res) => {
  let response;
  try {
    response = await fetch(LE_RABAIS_URL);
  } catch (err) {
    console.error("Le Rabais fetch failed:", err);
    return res.status(502).json({ error: "Could not reach Le Rabais - try again shortly." });
  }
  if (!response.ok) {
    return res.status(502).json({ error: `Le Rabais returned an error (${response.status}).` });
  }

  const text = await response.text();
  const rows = parseLeRabaisMarkdown(text);
  if (rows.length === 0) {
    return res.status(502).json({ error: "Could not parse any deals from Le Rabais - its format may have changed." });
  }

  const today = new Date().toISOString().slice(0, 10);
  const mapped = mapToFlyerDeals(rows, { postalCode: MONTREAL_POSTAL_CODE, today });
  const deals = mapped.map((d) => ({ ...d, userId: req.userId, source: LE_RABAIS_SOURCE }));

  await prisma.$transaction([
    prisma.flyerDeal.deleteMany({ where: { userId: req.userId, source: LE_RABAIS_SOURCE } }),
    ...(deals.length > 0 ? [prisma.flyerDeal.createMany({ data: deals })] : []),
  ]);

  res.status(201).json({ store: LE_RABAIS_SOURCE, count: deals.length });
});

// GET /api/flyers/pages/:id/image - serves one rendered flyer-page PNG.
// Cached hard since a page's image never changes once created (a re-upload
// creates new FlyerPage rows with new ids rather than mutating this one).
flyersRouter.get("/pages/:id/image", async (req, res) => {
  const page = await prisma.flyerPage.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!page) return res.status(404).end();
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(page.image);
});

// DELETE /api/flyers - clear every uploaded flyer's deals at once (e.g. to
// drop stale rows extracted before a matching fix, without re-uploading
// each store one at a time).
flyersRouter.delete("/", async (req, res) => {
  await prisma.$transaction([
    prisma.flyerDeal.deleteMany({ where: { userId: req.userId } }),
    prisma.flyerPage.deleteMany({ where: { userId: req.userId } }),
  ]);
  res.status(204).send();
});
