// The colour of each store's sticker in Store mode (design: docs/design/
// riso-v2-store-mode). One colour per store name, kept on this device
// (localStorage "mealprep-store-colors"). A store with no colour of its own gets
// one from the palette, always the same one for the same name.

export const STORE_COLORS_KEY = "mealprep-store-colors";

const KNOWN = { Metro: "#FF48B0", "Super C": "#FFE14D", "Fruits du jour": "#10C95C" };
const PALETTE = ["#FF48B0", "#FFE14D", "#10C95C", "#2323FF", "#FF8A3D", "#7B5CFF"];

export function defaultStoreColor(name) {
  if (KNOWN[name]) return KNOWN[name];
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// "#FF48B0", "ff48b0", "#f4b", "255, 72, 176" or "rgb(255,72,176)" -> "#FF48B0"; anything else -> null.
export function parseColor(text) {
  const s = String(text || "").trim();
  let m = s.match(/^#?([0-9a-f]{6})$/i);
  if (m) return `#${m[1].toUpperCase()}`;
  m = s.match(/^#?([0-9a-f]{3})$/i);
  if (m) return `#${m[1].split("").map((c) => c + c).join("").toUpperCase()}`;
  m = s.match(/^(?:rgb\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/i);
  if (m && [1, 2, 3].every((i) => Number(m[i]) <= 255)) {
    return `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  return null;
}

// The sticker's text on a light-theme background: ink or white, whichever has
// the higher WCAG contrast against the colour.
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ink = (L + 0.05) / (0.0098 + 0.05); // contrast with #16181F
  const white = 1.05 / (L + 0.05);
  return ink >= white ? "#16181F" : "#FFFFFF";
}

// What this device has saved: { store name: "#RRGGBB" }.
export function readStoreColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_COLORS_KEY) || "null");
    if (!saved || typeof saved !== "object") return {};
    return Object.fromEntries(Object.entries(saved).filter(([, v]) => parseColor(v)).map(([k, v]) => [k, parseColor(v)]));
  } catch {
    return {};
  }
}

export function writeStoreColors(colors) {
  try {
    if (Object.keys(colors).length === 0) localStorage.removeItem(STORE_COLORS_KEY);
    else localStorage.setItem(STORE_COLORS_KEY, JSON.stringify(colors));
  } catch {
    // Private mode: the colours just aren't remembered.
  }
}

export const colorOfStore = (colors, name) => colors[name] || defaultStoreColor(name);
