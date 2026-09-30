// Fetches a flyer item's product photo on the server and hands it to the
// browser from the app's own address. Flyer sites (Flipp's image host,
// lerabais.com) may refuse images shown on someone else's site, or still
// link them over plain http; fetched here - as if from their own pages -
// neither matters.

const MAX_BYTES = 3 * 1024 * 1024;
const CACHE_SIZE = 400;
const cache = new Map(); // url -> { type, body }, oldest first

// Private and local addresses are never fetched.
export function isFetchableImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === "::1" || /^f[cd]|^fe80/i.test(host)) return false;
  return true;
}

function remember(url, photo) {
  cache.delete(url);
  cache.set(url, photo);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
}

// { type, body } for the photo at `url`, or null when it can't be had.
// Plain http links are tried over https first.
export async function loadDealPhoto(url, { fetchImpl = fetch } = {}) {
  if (!isFetchableImageUrl(url)) return null;
  const hit = cache.get(url);
  if (hit) {
    remember(url, hit);
    return hit;
  }
  const attempts = url.startsWith("http:") ? [url.replace(/^http:/, "https:"), url] : [url];
  for (const attempt of attempts) {
    const photo = await fetchImage(attempt, fetchImpl);
    if (photo) {
      remember(url, photo);
      return photo;
    }
  }
  return null;
}

async function fetchImage(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (mealprep flyer photos)",
        Referer: `${new URL(url).origin}/`,
      },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) return null;
    return { type, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function clearDealPhotoCache() {
  cache.clear();
}
