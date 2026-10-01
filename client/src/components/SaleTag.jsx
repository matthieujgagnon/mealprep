// "Super C $3.99": where an ingredient is cheapest on this week's flyers,
// next to it wherever it's something to buy (Recipe card, Makeable). The
// same matching as the Grocery list's deal tags (findBestDeal).
export function SaleTag({ deal }) {
  if (!deal) return null;
  const perUnit =
    deal.unitBasis === "each" && deal.compareBasis && deal.compareBasis !== "each" && deal.comparePrice != null
      ? ` · $${deal.comparePrice.toFixed(2)}/${deal.compareBasis}`
      : "";
  return (
    <span className="riso-sale-tag" title={`On sale: ${deal.item}${perUnit}`}>
      <span className="riso-sale-tag-store">{deal.store}</span>
      <span className="riso-sale-tag-price">{deal.price}</span>
    </span>
  );
}
