import { Router } from "express";

export const dealsRouter = Router();

// MOCK DATA — structured the way real Reebee/Flipp flyer items look, so swapping
// in a live source later is a drop-in replacement for this array.
// TODO(live-sourcing): replace with a fetch to Flipp/Reebee's API once validated.
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

// GET /api/deals - this week's flyer specials across nearby stores
dealsRouter.get("/", async (req, res) => {
  res.json({
    region: "Montreal, QC (H1W)",
    stores: ["Metro", "Provigo", "Maxi", "Super C", "IGA"],
    weekOf: "2026-08-27",
    deals: MOCK_DEALS,
    isMockData: true,
  });
});
