import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const dealsRouter = Router();

// Sample data shown until at least one real flyer has been uploaded via
// POST /api/flyers/upload - structured the way real flyer items look, so it
// reads the same as the real thing before any deals exist yet.
const MOCK_DEALS = [
  { id: "d1", store: "Metro", category: "protein", item: "Boneless chicken breast", price: "$4.99/lb", validUntil: "2026-09-03" },
  { id: "d2", store: "Provigo", category: "protein", item: "Ground beef, extra lean", price: "$5.49/lb", validUntil: "2026-09-03" },
  { id: "d3", store: "Super C", category: "produce", item: "Bell peppers", price: "$1.49/lb", validUntil: "2026-09-03" },
  { id: "d4", store: "Maxi", category: "produce", item: "Broccoli crowns", price: "$1.99/lb", validUntil: "2026-09-03" },
  { id: "d5", store: "IGA", category: "protein", item: "Atlantic salmon fillet", price: "$9.99/lb", validUntil: "2026-09-03" },
  { id: "d6", store: "Metro", category: "staple", item: "Pasta, 900g", price: "$1.99", validUntil: "2026-09-03" },
  { id: "d7", store: "Provigo", category: "produce", item: "Roma tomatoes", price: "$1.29/lb", validUntil: "2026-09-03" },
  { id: "d8", store: "Super C", category: "staple", item: "Rice, 2kg bag", price: "$3.99", validUntil: "2026-09-03" },
];

// GET /api/deals - this week's flyer specials across nearby stores. Serves
// real deals extracted from uploaded flyers once any exist, falling back to
// sample data before the first upload.
dealsRouter.get("/", async (req, res) => {
  const rows = await prisma.flyerDeal.findMany({ orderBy: { createdAt: "desc" } });

  if (rows.length === 0) {
    return res.json({
      region: "Montreal, QC (H1W)",
      stores: ["Metro", "Provigo", "Maxi", "Super C", "IGA"],
      weekOf: "2026-08-27",
      deals: MOCK_DEALS,
      isMockData: true,
    });
  }

  const stores = [...new Set(rows.map((r) => r.store))];
  res.json({
    region: "Montreal, QC (H1W)",
    stores,
    weekOf: null,
    deals: rows,
    isMockData: false,
  });
});
