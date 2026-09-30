import { assertSafeRecipeUrl } from "./urlSafety.js";

// Picks a recipe's photos from everything a page offers: the schema.org
// Recipe image (the site's own choice), the page's share image (og:image /
// twitter:image), and <img> tags in the recipe card. Sites list the same
// photo several times - square/4:3/16:9 crops, WordPress thumbnails like
// "-300x200.jpg", lazy-load placeholders - so candidates are grouped by
// photo, the best version of each is kept, and each is checked (a small
// ranged download) for being a real image and not a tiny one.

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Not a food photo: site chrome, people, tracking pixels, plugin assets.
export const NOISE_PATTERN =
  /(logo|icon|avatar|sprite|pixel|badge|share|social|advert|gravatar|blank|spacer|placeholder|lazy[-_]?load|loading|author|headshot|profile|byline|comment|nav|widget|sidebar|footer|menu|emoji|rating|star|wp-content\/plugins|wp-includes|\.svg(\?|$))/i;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
// "-1200x800" (WordPress sizes) or "-1x1" / "-16x9" (aspect crops) right
// before the extension.
const SIZE_SUFFIX = /-(\d{1,4})x(\d{1,4})(?=\.(?:jpe?g|png|webp|gif|avif)$)/i;

const HENTITIES = { "&amp;": "&", "&#038;": "&", "&#38;": "&", "&quot;": '"', "&#x2F;": "/" };

export function cleanImageUrl(raw, baseUrl) {
  if (!raw || typeof raw !== "string") return null;
  const decoded = raw.trim().replace(/&amp;|&#038;|&#38;|&quot;|&#x2F;/g, (m) => HENTITIES[m]);
  if (!decoded || decoded.startsWith("data:")) return null;
  try {
    const url = new URL(decoded, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

// "a.jpg 300w, b.jpg 1200w" (or "1x, 2x") -> [{ url, w }], largest first.
// `w` is a real pixel width only for "w" descriptors.
export function parseSrcset(srcset, baseUrl) {
  if (!srcset) return [];
  return srcset
    .split(/,\s+(?=\S)/)
    .map((part) => {
      const [u, d] = part.trim().split(/\s+/);
      const url = cleanImageUrl(u, baseUrl);
      if (!url) return null;
      const w = d?.endsWith("w") ? parseInt(d, 10) : null;
      const x = d?.endsWith("x") ? parseFloat(d) : 1;
      return { url, w: Number.isFinite(w) ? w : null, rank: w || x };
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank);
}

// Every version of the photo an <img> (or its <picture>) points at, the
// sharpest first: srcset entries (lazy-load plugins keep them in data-*
// attributes), Pinterest's full-size copy, then plain src.
export function candidatesFromImg($, el, baseUrl) {
  const $el = $(el);
  const out = [];
  const add = (url, width, height) => {
    const u = cleanImageUrl(url, baseUrl);
    if (u && !out.some((c) => c.url === u)) out.push({ url: u, width: width || null, height: height || null });
  };
  const srcsets = [
    $el.attr("data-lazy-srcset"),
    $el.attr("data-srcset"),
    $el.attr("srcset"),
    ...$el
      .closest("picture")
      .find("source")
      .map((_, s) => $(s).attr("data-srcset") || $(s).attr("srcset"))
      .get(),
  ];
  for (const set of srcsets) for (const { url, w } of parseSrcset(set, baseUrl)) add(url, w);
  // Pinterest's full-size copy - sometimes a text-overlay pin graphic, so it
  // ranks below the page's own sizes.
  add($el.attr("data-pin-media"));
  const w = parseInt($el.attr("width"), 10) || null;
  const h = parseInt($el.attr("height"), 10) || null;
  for (const attr of ["data-lazy-src", "data-src", "data-original", "data-orig-file", "src"]) add($el.attr(attr), w, h);
  return out;
}

// Same photo, different size/crop -> same key.
export function photoIdentity(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(SIZE_SUFFIX, "").replace(/-scaled(?=\.\w+$)/i, "");
    const keepQuery = !IMAGE_EXT.test(u.pathname);
    return `${u.host}${path}${keepQuery ? u.search : ""}`.toLowerCase();
  } catch {
    return url;
  }
}

// WordPress keeps the full-size original next to every "-300x200" copy.
export function originalOf(url) {
  try {
    const u = new URL(url);
    if (!SIZE_SUFFIX.test(u.pathname)) return null;
    const [, w, h] = u.pathname.match(SIZE_SUFFIX);
    if (Number(w) <= 16 && Number(h) <= 16) return null; // "-16x9" is a crop, not a thumbnail
    u.pathname = u.pathname.replace(SIZE_SUFFIX, "");
    return u.href;
  } catch {
    return null;
  }
}

// Width/height from the first bytes of a JPEG, PNG, GIF or WebP.
export function readImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF
  if (buf.toString("ascii", 0, 4) === "GIF8") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X" && buf.length >= 30) {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    return null;
  }
  // JPEG: walk the segments to the frame header.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Downloads just enough of an image to read its size. Returns
// { ok: true, width, height } for a real image, { ok: false } for a
// definite miss (404, not an image), or null when it couldn't tell (the
// site blocked the check, it timed out) - those are kept, just ranked lower.
export async function probeImage(url, { referer, timeoutMs = 4000, fetchImpl = fetch } = {}) {
  try {
    await assertSafeRecipeUrl(url);
  } catch {
    return { ok: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Range: "bytes=0-131071",
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (res.status === 404 || res.status === 410) return { ok: false };
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type && !type.startsWith("image/") && !type.includes("octet-stream")) return { ok: false };
    if (/svg/.test(type)) return { ok: false };
    const chunks = [];
    let total = 0;
    const reader = res.body?.getReader?.();
    if (reader) {
      while (total < 131072) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        total += value.length;
        const size = readImageSize(Buffer.concat(chunks));
        if (size) {
          reader.cancel().catch(() => {});
          return { ok: true, ...size };
        }
      }
      reader.cancel().catch(() => {});
    } else {
      chunks.push(Buffer.from(await res.arrayBuffer()));
    }
    const size = readImageSize(Buffer.concat(chunks));
    return size ? { ok: true, ...size } : type.startsWith("image/") ? { ok: true, width: null, height: null } : { ok: false };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SOURCE_RANK = { ld: 0, meta: 1, dom: 2 };
const MIN_SIDE = 200; // smaller than this is a thumbnail or an icon
const MAX_GROUPS = 10;

const area = (c) => (c.width && c.height ? c.width * c.height : c.width ? c.width * c.width * 0.66 : 0);

// candidates: [{ url, width?, height?, source: "ld" | "meta" | "dom" }] in
// page order. Returns { photoUrl, photos }.
export async function selectPhotos(candidates, { referer, probe = probeImage, exclude = [] } = {}) {
  const excluded = new Set(exclude.filter(Boolean).map(photoIdentity));
  // Group versions of the same photo; the group keeps its best source.
  const groups = new Map();
  for (const c of candidates) {
    if (!c?.url) continue;
    // The recipe image and share image are the site's own picks; only
    // images scanned out of the page get the logo/icon filter.
    if (c.source === "dom" && NOISE_PATTERN.test(c.url)) continue;
    if (/\.svg(\?|$)/i.test(c.url)) continue;
    const key = photoIdentity(c.url);
    if (excluded.has(key) && c.source === "dom") continue; // a step photo - it lives with its step
    if (!groups.has(key)) groups.set(key, { key, source: c.source, order: groups.size, variants: [] });
    const g = groups.get(key);
    if (SOURCE_RANK[c.source] < SOURCE_RANK[g.source]) g.source = c.source;
    if (!g.variants.some((v) => v.url === c.url)) g.variants.push({ ...c });
    const original = originalOf(c.url);
    if (original && !g.variants.some((v) => v.url === original)) g.variants.push({ url: original, source: c.source, guessed: true });
  }
  const ranked = [...groups.values()]
    .sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.order - b.order)
    .slice(0, MAX_GROUPS);

  // Check the likeliest versions of each photo: a guessed original, then
  // the biggest declared one, then whatever else there is (up to 3).
  await Promise.all(
    ranked.flatMap((g) => {
      const toCheck = [...g.variants].sort((a, b) => (b.guessed ? 1 : 0) - (a.guessed ? 1 : 0) || area(b) - area(a)).slice(0, 3);
      return toCheck.map(async (v) => {
        const result = await probe(v.url, { referer });
        v.checked = result;
        if (result?.ok && result.width) {
          v.width = result.width;
          v.height = result.height;
        }
      });
    })
  );

  const usable = [];
  for (const g of ranked) {
    const variants = g.variants.filter((v) => {
      if (v.checked?.ok === false) return false;
      if (v.guessed && !v.checked?.ok) return false; // an unconfirmed guess
      if (v.width && v.height && Math.min(v.width, v.height) < MIN_SIDE) return false;
      return true;
    });
    if (variants.length === 0) continue;
    // Confirmed images beat unconfirmed ones; then the biggest.
    variants.sort((a, b) => (b.checked?.ok ? 1 : 0) - (a.checked?.ok ? 1 : 0) || area(b) - area(a));
    usable.push({ ...g, variants, best: variants[0] });
  }
  if (usable.length === 0) return { photoUrl: null, photos: [] };

  // The main photo: the site's own recipe image when it's a decent size,
  // otherwise its share image, otherwise the biggest photo in the card. For
  // the main photo a landscape crop reads better than a square one.
  const heroGroup =
    usable.find((g) => g.source === "ld" && area(g.best) >= 300 * 300) ||
    usable.find((g) => g.source === "meta" && area(g.best) >= 300 * 300) ||
    [...usable].sort((a, b) => area(b.best) - area(a.best))[0];
  const landscape = heroGroup.variants
    .filter((v) => v.width && v.height && v.width >= v.height && v.width >= 600)
    .sort((a, b) => area(b) - area(a))[0];
  const heroUrl = (landscape || heroGroup.best).url;

  const photos = [heroUrl, ...usable.filter((g) => g !== heroGroup).map((g) => g.best.url)];
  return { photoUrl: heroUrl, photos: [...new Set(photos)] };
}
