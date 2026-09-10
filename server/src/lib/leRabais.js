// Parses the pipe-delimited Markdown deals table that Le Rabais
// (lerabais.com) publishes at Liste/Tableau.md. That file is itself the
// pre-compiled output of Le Rabais's own backend pulling from Flipp across
// many stores - this just reads the already-structured result, so unlike
// the PDF/photo upload path there's no OCR or AI extraction involved here.

// Confirmed header/column order from a real sample of the file:
// CodePostal|Emoji|Type|Date Debut|Date Fin|Catégorie|Produit|Product|Pays|Magasin|Prix unité, lb et kg|Lien|NomImage|Conservation
const COLUMNS = [
  "postalCode",
  "emoji",
  "type",
  "dateDebut",
  "dateFin",
  "categorie",
  "produit",
  "product",
  "pays",
  "magasin",
  "prix",
  "lien",
  "nomImage",
  "conservation",
];

// Parses the raw Markdown-table text into row objects. Skips the header row,
// the "---|---|..." separator row, and any blank/fence lines around the
// table (the file itself has no fence, but this stays tolerant of one).
export function parseLeRabaisMarkdown(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (trimmed.startsWith("|CodePostal|")) continue; // header
    if (/^\|[-:|\s]+\|$/.test(trimmed)) continue; // separator row (":--|--:|...")

    const cells = trimmed.split("|").slice(1, -1);
    if (cells.length !== COLUMNS.length) continue;

    const row = {};
    COLUMNS.forEach((col, i) => {
      row[col] = cells[i].trim();
    });
    rows.push(row);
  }
  return rows;
}

// The site's own already-computed per-lb/per-kg figures are embedded in the
// price string's parenthetical - reused directly here rather than
// re-deriving them, since they're already normalized. Confirmed against a
// real 636-row sample to cover every price string the file contains, in
// exactly these three shapes:
//   "3,99 $ ch. (1,33 $ /lb, 2,93 $/kg)"  -> per-lb figure in the parens
//   "0,99 $ /lb (2,18 $/kg)"              -> per-lb figure up front
//   "8,99 $ chacun"                       -> flat each price, no per-lb
//   "10 pour 4,99 $"                      -> multibuy, reduced to each
export function parsePrixString(prix) {
  const perLb = prix.match(/(\d+),(\d+)\s*\$\s*\/lb/);
  if (perLb) {
    return { unitPrice: Number(`${perLb[1]}.${perLb[2]}`), unitBasis: "lb" };
  }
  const chacun = prix.match(/^(\d+),(\d+)\s*\$\s*chacun/);
  if (chacun) {
    return { unitPrice: Number(`${chacun[1]}.${chacun[2]}`), unitBasis: "each" };
  }
  const multibuy = prix.match(/^(\d+)\s+pour\s+(\d+),(\d+)\s*\$/);
  if (multibuy) {
    const count = Number(multibuy[1]);
    const total = Number(`${multibuy[2]}.${multibuy[3]}`);
    return { unitPrice: Math.round((total / count) * 100) / 100, unitBasis: "each" };
  }
  return { unitPrice: null, unitBasis: null };
}

// Le Rabais's "Type" column (Fruits, Légumes, Viande, Laitier, Garde-Manger,
// Riz, Noix, Eau) maps onto the app's own category enum - no bakery value
// has ever appeared in the source data, so nothing maps there.
const TYPE_TO_CATEGORY = {
  Viande: "protein",
  Fruits: "produce",
  Légumes: "produce",
  Laitier: "dairy",
  "Garde-Manger": "staple",
  Riz: "staple",
  Noix: "staple",
  Eau: "staple",
};

// Filters the full parsed table (which carries weeks of history) down to
// whichever single row set is currently valid, and maps it onto the
// FlyerDeal shape. `today` is a "YYYY-MM-DD" string so this is comparable
// straight against the file's own date strings, no Date/timezone math
// needed - each store publishes exactly one current Date Debut/Date Fin
// window at a time, so this filter alone selects "this week's deals per
// store" with no extra per-store "most recent" logic required.
export function mapToFlyerDeals(rows, { postalCode, today }) {
  return rows
    .filter((r) => r.postalCode === postalCode && r.dateDebut <= today && today <= r.dateFin)
    .map((r) => {
      const { unitPrice, unitBasis } = parsePrixString(r.prix);
      return {
        store: r.magasin,
        item: r.produit,
        matchName: r.product || r.produit,
        price: r.prix,
        unitPrice,
        unitBasis,
        category: TYPE_TO_CATEGORY[r.type] || "other",
        validUntil: r.dateFin || null,
      };
    });
}
