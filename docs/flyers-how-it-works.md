# How the Flyers work

This explains where the flyer deals come from and where their past prices come from. It also covers how a deal is judged and how every number on a card is worked out. Code paths are given so each step can be checked.

## 1. How the deals are pulled

**Source.** Flipp (the app behind most Canadian grocery flyers) has a public JSON API. There is no key and no scraping of web pages (`server/src/lib/flipp.js`).

1. **Which flyers.** `GET /flyers?postal_code=H2T2S3` lists every flyer near your postal code. Only grocery flyers from the stores you picked are kept (Metro, IGA, Maxi, Super C and Provigo by default).
2. **Which items.** `GET /flyers/{id}` returns each flyer's items, but often only with a bare price ("3.0").
3. **Each item's own page.** `GET /items/{id}` is looked up for every priced item, 8 at a time and about 30 ms each. It holds the rest of the item:
   - the price texts ("2/", "/lb", "le 100 g");
   - the description ("format écono 1,2 kg");
   - the *sale story* ("SAVE $2", "375 points…");
   - the regular price and the photo.
4. **Turning it into a deal** (`normalizeFlippItem`):
   - **Price.** The printed price is rebuilt ("2/$5.00", "$4.99/lb") and reduced to one comparable number: per lb for weight, per L for volume, otherwise each. Per kg and per 100 g become per lb. "2 for $5" becomes $2.50 each. Loblaw stores (Maxi, Provigo) mark per-weight items with a `_KG` code; those prices are per lb.
   - **Amounts off.** "Rabais de 3$" / "save $3" is an amount off, not a price. The sale price is worked out when the regular price is given; otherwise the deal shows "$3.00 off".
   - **Not a price (new).** Some tiles carry a number that isn't what the item costs:
     - points offers where the number is the points' worth. Metro's "375 points à l'achat d'un pâté au poulet, valeur de 3$" used to come through as a $3.00 pot pie.
     - "GRATUIT … à l'achat de …" (free with another purchase);
     - "annoncé à … valeur de" bundles.

     These now read **Points offer**, **Free with purchase** or **Worth $X**, with no comparable price. They are never judged as a deal.
   - **Pack size.** A size printed only in the description ("3 lb bag") is added to the name, so a bag is compared per lb.
   - **Regular price.** It comes from the item page's `original_price`, dollars or percent off, or text such as "Reg. $6.99", "SAVE $2.00" or "économisez 25%". It is kept only when it makes sense: above the sale price and under 5× it.
   - **Regular price per kg (new).** IGA and Metro print meat's sale price per lb but its regular price per kg. "$11.99/lb … Rég. 30,19$/kg" used to read as $30.19/lb regular, so 60% off; it is really $13.69/lb, so 12% off. The unit after the regular price is now read and converted. This inflated most meat "savings" at those two stores. Flipp's own `original_price` field can be the per-kg figure too. Metro's chicken legs: "$3.99/lb – 8,80$/kg" came with an original price of 9.99 ("60% off") while the flyer prints "reg. 4,99/lb". When the item's text shows the sale per kg and the original sits just above it, the original is read as per kg.
   - **Match name** (`toMatchName`): the plain product name that everything else compares by. It lowercases the name and drops sizes and anything after "with/avec". Then it picks the right half or choice:
     - **Bilingual names.** For "French | English" names, the English half is used. If that half doesn't name a food, the French half is used instead. Example: "ESCALOPE DE POULET … | AIR CHILLED, UP TO 590 G" → *chicken cutlet*.
     - **Choices.** In "X or Y", the choice that names the product is used:
       - "Old fashioned or Black Forest smoked ham" → *black forest smoked ham*;
       - "Red or Green peppers" → *green peppers*;
       - "Beef or chicken pie" → *beef pie*.
     - **French-only names** are translated with a grocery glossary of about 220 phrases:
       - "PÂTÉ AU POULET" → *chicken pie*;
       - "AILLES DE POULET" → *chicken wings*;
       - "GIGOT D'AGNEAU" → *lamb leg*;
       - "LAIT CONDENSÉ SUCRÉ" → *sweetened condensed milk*.

       Before this change, unknown words were dropped, so a pot pie, wings, burgers and cutlets all came out as plain *chicken*. That is why the Chicken card mixed them together.
5. **Saving the week** (`server/src/lib/flyerImport.js`). The import runs every Thursday: hourly checks, plus a weekly GitHub Action that wakes the server. "Import now" on the Flyers page runs it on demand. This week's rows are saved as *current*. Last week's rows stay in the database as *past* rows, and those are the price history. After each import, and once each time the server starts, past rows are renamed with the current naming rules, so old and new weeks line up.

## 2. How the price history is pulled

Each deal is compared with the first of three sources that exists (`server/src/lib/priceCompare.js`, `withPriceHistory` in `server/src/routes/deals.js`):

1. **"store": the same product at the same store** over the last 26 weeks of imported flyers. It needs prices from at least 2 different weeks.
2. **"stores": the same product at any store**, also over 26 weeks with at least 2 weeks.
   - **Same product.** Products are matched by their words, after brands, sizes, plurals and filler ("fresh", "selected", "club"…) are removed. So *PC salmon fillets, 454 g* is `fillet salmon`.
   - **Shorter names.** Another product's name can stand in only if all its words are in this deal's name. *Atlantic salmon fillets* can use *salmon fillets*.
   - **Same cut and form (new).** The stand-in must also name the same cut ("breast", "ground"), the same form ("cooked", "breaded", "smoked") and the same food ("pie"). Plain *chicken* prices no longer stand in for a chicken pie, and plain *salmon* no longer stands in for salmon fillets.
3. **"quebec": Statistics Canada's monthly Quebec average** for that kind of product, over its last 6 published months. This is table 18‑10‑0245‑01, built from retailers' checkout data (`server/src/lib/statcan.js`). It is refreshed in the background and stored in the database.

If none of the three exists, the deal is marked **New · no history yet**.

**Prices are compared on the same footing.** A pack price becomes a per-lb or per-L price from its size: *Butter, 454 g* at $4.99 is $4.99/lb. A counted bag becomes a price per item (new): a "5 un." avocado bag at $4.50 is $0.90 each. Eggs stay per dozen.

**The 6-month chart** shows each month's lowest price. **Low / high** are the lowest and highest prices over those weeks, this week included. With only this week's price there is no lowest, average or highest to show, so the card says so instead of repeating the same price three times.

## 3. How the deals actually work

### The Quebec average ("the median price")

This is the number that "often didn't work with the article". Each Statistics Canada product is a specific thing at a specific size:

- *Whole chicken, per kilogram*
- *Chicken breasts, per kilogram*
- *Milk, 4 litres*
- *Potatoes, 4.54 kilograms*
- *Frozen broccoli, 500 grams*
- *Canned tuna, 170 grams*
- *Pork loin cuts, per kilogram*

There are about 110 in all.

The old rule matched a deal to the Quebec product whose words were all in the deal's name. "Whole" was ignored, so *Whole chicken* matched anything with "chicken" in it. Every chicken product was then compared with whole chicken:

| Chicken product | Shown vs whole chicken |
| --- | --- |
| Pot pie | −72% |
| Wings | +185% |
| Breaded fillets | +149% |
| Cutlets | +147% |
| Burgers | +111% |

Ice cream was compared with cream, cherry tomatoes with tomatoes, grape tomatoes with grapes, tomato paste with canned tomatoes and potato chips with a 10 lb bag of potatoes.

The match (`findBaseline`) now also requires the same product:

- **The product is the last food named.** *Grape tomatoes* are tomatoes and *chicken pie* is pie. A Quebec product only matches if no other food follows its words in the deal's name.
- **Same cut.** Chicken legs, wings, thighs and ground chicken don't match *Whole chicken*. A Quebec "cuts" product stands for its cuts: pork loin chops match *Pork loin cuts*, and side and back ribs match *Pork rib cuts*.
- **Same form.** Cooked, roasted, rotisserie, breaded, marinated, seasoned, stuffed, smoked (except bacon or ham), mock, boiling, burgers, nuggets, strips, cutlets, skewers and tournedos all have no Quebec match.
- **Not another product.** The French half counts too:
  - ice cream, sour cream, condensed and evaporated milk;
  - flour, paste, chips and *croustilles*, fries, crispy, dough, pops, pockets;
  - cherry and grape tomatoes;
  - juice, cake, pie, soup and the like.
- **Frozen and canned.** *Frozen broccoli* only matches frozen broccoli, not a fresh crown. *Canned tuna* only matches a can, not a fresh tuna steak or a 2 L basket of pears.
- **Closest size.** A 4 L milk jug is compared with *Milk, 4 litres* (not 1 L). Loose onions are compared with *Onions, per kilogram*, and a 3 lb bag with *Onions, 1.36 kilograms*.

When nothing fits, the card shows no Quebec comparison rather than a wrong one.

### The cards on the Flyers page

There is one card per product, with each store's price side by side (`client/src/lib/flyerIngredients.js`).

- **Which products share a card.** Products share a card when they reduce to the same name (brand, size and filler removed). A longer name joins a shorter one only when it is a variety of it: *maple bacon* joins *bacon*.
- **What never joins (new).** A name never joins after a food (*pizza bagels*, *chicken burgers*) or after a prepared form (*mock chicken*, *hot cooked chicken*, *boiling chicken*, *roasted chicken*). "Cooked", "roasted" and "strips" stay in the name. The old Chicken card is now about ten cards:
  - Chicken pie
  - Chicken wings
  - Chicken burgers
  - Chicken cutlet
  - Hot cooked chicken
  - Boiling chicken
  - Mock chicken
  - Roasted Portuguese chicken
  - Chicken breast strips
  - Chicken breasts
  - Chicken legs
  - Whole chicken
- **Aisles** come from the name, using rules checked in order (`server/src/lib/dealAisle.js`). New: Blue Water and High Liner fish go under Fish & seafood (not Drinks or Snacks), Nestlé "Drumstick" cones go under Frozen, and ground coffee is no longer meat.

## 4. How everything is calculated

**Comparable price.** The deal's per-lb or per-L price, or its pack price divided by the pack size, or per item.

**Saving** (`dealSavings`) is the best real evidence a deal has. It needs to be at least 5% to count, and it is capped at 95%. The evidence is:

- **the flyer's own regular price:** (regular − sale) ÷ regular;
- **at least 10% under Quebec's average:** that percentage;
- **in the bottom quarter of its 6-month range:** (6-month high − price) ÷ high.

**Range position.** `t` = (price − 6-month low) ÷ (high − low): 0 is the low and 1 is the high. It only uses the app's own history, not Quebec's.

**Verdict** (`dealVerdict`):

| Verdict | When |
| --- | --- |
| **Stock up** | a real saving, and either its lowest price in 6 months (t ≤ 0.05) or 25%+ off |
| **Buy** | a smaller real saving |
| **Skip** | in the top 40% of its range (t ≥ 0.6) or 10%+ over Quebec's average |
| **Only if you need it** | a normal price |
| **Can't tell yet** | nothing to compare with |
| **Not a price** | points offers and free-with-purchase items |

**Quebec comparison.** pct = (price − Quebec average) ÷ average:

- −25% or lower: *stock-up*;
- −10% or lower: *good*;
- up to +10%: *normal*;
- above that: *high*.

**Store gap.** (highest store price − lowest) ÷ highest, across the stores carrying the product this week.

**"Best deal" sort.** Saving + (1 − t) × 0.15 + gap × 0.1. Without a range, it is saving + gap × 0.2.

## The dashboard: proteins on sale this week

Home's old "On sale" box showed the first three flyer rows, whatever they were (waffles, deodorant, wine). It now shows **Proteins on sale**, one row per kind (`client/src/lib/proteins.js`):

- Chicken
- Beef
- Pork
- Fish
- Seafood
- Turkey
- Lamb & veal

**Which items count.** Only plain cuts from the meat and fish aisles. Pies, burgers, nuggets, sausages, ham, bacon, deli meats, cooked or breaded items, soups and pet food are left out.

**Each row shows** the kind's best buy:

- the biggest verdict first, then the biggest saving, then the lowest price per lb;
- its store and price per lb;
- the verdict;
- how many other items of that kind are really on sale.

A kind with nothing really on sale says so. Tapping a row opens that deal's card, with the kind's other items under "Also on sale".

## Checking it against a live week

All of this was checked against the real flyers of the week ending October 7, 2026: 1,411 items from Metro, IGA, Maxi, Super C and Provigo around H2T 2S3. The check ran the app's own code in a temporary GitHub Action, since the dev sandbox can't reach Flipp. The unit tests use the real product names from that week (`server/src/lib/*.test.js`, `client/src/lib/flyerIngredients.test.js`).
