# Meal pricing

Every ingredient gets a unit price, picked in this order:
1. Sale price from a current flyer deal (tag: SALE + store).
2. Regular price found in a flyer (tag: FLYER + store).
3. Median price of that ingredient across known prices (tag: MEDIAN).

From that, each recipe shows:
- **To buy**: the sum of items you need to buy, priced per package (≈).
- **From inventory**: the value of what the recipe uses from inventory, priced by the amount used (≈).
- **This meal**: To buy + From inventory, plus the cost per serving. Shown on the receipt and in the recipe's fact line.

Rescaling servings rescales all three. All prices show as estimates (≈). The Prices switch on the card hides every price.

Drawn in Recipe Card.dc.html (approved design).
