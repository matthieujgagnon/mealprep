import { describe, expect, it } from "vitest";
import { LE_RABAIS_IMAGE_BASE_URL, mapToFlyerDeals, parseLeRabaisMarkdown, parsePrixString } from "./leRabais.js";

// A real excerpt of lerabais.com/Liste/Tableau.md, pasted by hand from the
// live site - locks in the parser against the actual format, not a guess.
const REAL_SAMPLE = `|CodePostal|Emoji|Type|Date Debut|Date Fin|Catégorie|Produit|Product|Pays|Magasin|Prix unité, lb et kg|Lien|NomImage|Conservation|
:--|:--|:--|--:|--:|:--|:--|:--|:--|:--|:--|:--|:--|:--|
|H2T2S3|🍋|Fruits|2026-07-02|2026-07-08|Citrons|Citrons|Lemons||Adonis|10 pour 4,99 $|https://flipp.com/fr-ca/montreal-qc/produit/1022993773-adonis-weekly?postal_code=H2T2S3|2026-07-08_H2T2S3_Adonis_Citrons.jpg||
|H2T2S3|🐄|Laitier|2026-07-02|2026-07-08|Fromage en bloc|Fromage En Bloc Ou Râpé Selection (400 g)|Selection of Block or Grated Cheese (400g)||Adonis|4,97 $ ch. (5,64 $ /lb, 12,43 $/kg)|https://flipp.com/fr-ca/montreal-qc/produit/1022993613-adonis-weekly?postal_code=H2T2S3|2026-07-08_H2T2S3_Adonis_Fromage_En_Bloc_Ou_Rpe_Selection_400_g.jpg||
|H2T2S3|🥩|Viande|2026-07-02|2026-07-08|Poulet haché|Poulet Haché Maigre Zabiha Surgelé (454 g), Surgelé|Zabiha Frozen Lean Minced Chicken (454 g), Frozen||Adonis|2,99 $ ch. (2,99 $ /lb, 6,59 $/kg)|https://flipp.com/fr-ca/montreal-qc/produit/1022993876-adonis-weekly?postal_code=H2T2S3|2026-07-08_H2T2S3_Adonis_Poulet_Hache_Maigre_Zabiha_Surgele_454_g_Surgele.jpg||
|H2S1A1|🍋|Fruits|2026-07-02|2026-07-08|Citrons|Citrons|Lemons||Metro|1,99 $ chacun|https://flipp.com/x|other-postal-code.jpg||`;

describe("parseLeRabaisMarkdown", () => {
  it("parses every data row, skipping the header and separator rows", () => {
    const rows = parseLeRabaisMarkdown(REAL_SAMPLE);
    expect(rows).toHaveLength(4);
  });

  it("maps each column to the right field, in the file's real order", () => {
    const [row] = parseLeRabaisMarkdown(REAL_SAMPLE);
    expect(row).toMatchObject({
      postalCode: "H2T2S3",
      magasin: "Adonis",
      produit: "Citrons",
      product: "Lemons",
      prix: "10 pour 4,99 $",
      nomImage: "2026-07-08_H2T2S3_Adonis_Citrons.jpg",
      dateFin: "2026-07-08",
    });
  });
});

describe("parsePrixString", () => {
  it("reads a per-lb price with a parenthetical per-kg figure", () => {
    expect(parsePrixString("0,99 $ /lb (2,18 $/kg)")).toEqual({ unitPrice: 0.99, unitBasis: "lb" });
  });

  it("reads a per-lb figure embedded in an 'each' price's parens", () => {
    expect(parsePrixString("4,97 $ ch. (5,64 $ /lb, 12,43 $/kg)")).toEqual({ unitPrice: 5.64, unitBasis: "lb" });
  });

  it("reads a flat 'chacun' (each) price with no per-lb figure", () => {
    expect(parsePrixString("8,99 $ chacun")).toEqual({ unitPrice: 8.99, unitBasis: "each" });
  });

  it("reduces a multibuy price to a single each price", () => {
    expect(parsePrixString("10 pour 4,99 $")).toEqual({ unitPrice: 0.5, unitBasis: "each" });
  });

  it("returns nulls for a price shape it doesn't recognize", () => {
    expect(parsePrixString("gratuit")).toEqual({ unitPrice: null, unitBasis: null });
  });
});

describe("mapToFlyerDeals", () => {
  it("keeps only rows for the given postal code that are valid today", () => {
    const rows = parseLeRabaisMarkdown(REAL_SAMPLE);
    const mapped = mapToFlyerDeals(rows, { postalCode: "H2T2S3", today: "2026-07-05" });
    expect(mapped).toHaveLength(3);
    expect(mapped.every((d) => d.store === "Adonis")).toBe(true);
  });

  it("excludes rows outside the valid date window", () => {
    const rows = parseLeRabaisMarkdown(REAL_SAMPLE);
    expect(mapToFlyerDeals(rows, { postalCode: "H2T2S3", today: "2026-08-01" })).toHaveLength(0);
  });

  it("builds imageUrl from NomImage against the real, confirmed image host", () => {
    const rows = parseLeRabaisMarkdown(REAL_SAMPLE);
    const [deal] = mapToFlyerDeals(rows, { postalCode: "H2T2S3", today: "2026-07-05" });
    expect(deal.imageUrl).toBe(
      LE_RABAIS_IMAGE_BASE_URL + "2026-07-08_H2T2S3_Adonis_Citrons.jpg"
    );
    // This exact URL was hand-confirmed to load a real photo on the live site.
    expect(deal.imageUrl).toBe("https://lerabais.com/images/weekly-groceries/2026-07-08_H2T2S3_Adonis_Citrons.jpg");
  });

  it("maps French category names onto the app's category enum", () => {
    const rows = parseLeRabaisMarkdown(REAL_SAMPLE);
    const mapped = mapToFlyerDeals(rows, { postalCode: "H2T2S3", today: "2026-07-05" });
    const cheese = mapped.find((d) => d.item.includes("Fromage"));
    expect(cheese.category).toBe("dairy");
  });
});
