// Where to read a store's whole flyer: the chain's own flyer page when we
// know it, else Flipp's search for that store near the postal code.
const STORE_FLYERS = [
  [/^metro\b/i, "https://www.metro.ca/en/flyer"],
  [/^super ?c\b/i, "https://www.superc.ca/en/flyer"],
  [/^maxi\b/i, "https://www.maxi.ca/en/print-flyer"],
  [/^provigo\b/i, "https://www.provigo.ca/en/print-flyer"],
  [/^iga\b/i, "https://www.iga.net/en/flyer"],
  [/^loblaws\b/i, "https://www.loblaws.ca/en/print-flyer"],
  [/^no ?frills\b/i, "https://www.nofrills.ca/en/print-flyer"],
  [/^walmart\b/i, "https://www.walmart.ca/en/flyer"],
];

export function flyerUrl(store, postalCode) {
  const name = String(store || "").trim();
  const known = STORE_FLYERS.find(([re]) => re.test(name));
  if (known) return known[1];
  const pc = String(postalCode || "").replace(/\s/g, "").toUpperCase();
  return `https://flipp.com/en-ca/search/${encodeURIComponent(name)}${pc ? `?postal_code=${pc}` : ""}`;
}

// The same rule the import uses to tie a picked store to a Flipp flyer:
// "Super C" is "SUPER C (Montreal)"; "IGA" is "IGA extra" but not "BIGAR".
export function merchantMatches(merchant, store) {
  const m = ` ${merchant.toLowerCase()} `;
  const s = store.toLowerCase().trim();
  return m.includes(` ${s} `) || m.trim() === s || m.trim().startsWith(`${s} `);
}
