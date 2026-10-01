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
  for (const attempt of attemptsFor(url)) {
    const { photo } = await fetchImage(attempt, fetchImpl);
    if (photo) {
      remember(url, photo);
      return photo;
    }
  }
  return null;
}

// What happened fetching the photo, for the item's detail view when it
// doesn't show: each address tried and the answer it got.
export async function checkDealPhoto(url, { fetchImpl = fetch } = {}) {
  if (!isFetchableImageUrl(url)) return { url, ok: false, tries: [{ url, reason: "not a web address the app can fetch" }] };
  const tries = [];
  for (const attempt of attemptsFor(url)) {
    const { photo, ...result } = await fetchImage(attempt, fetchImpl);
    tries.push({ url: attempt, ...result, ...(photo ? { type: photo.type, bytes: photo.body.length } : {}) });
    if (photo) return { url, ok: true, tries };
  }
  return { url, ok: false, tries };
}

function attemptsFor(url) {
  return url.startsWith("http:") ? [url.replace(/^http:/, "https:"), url] : [url];
}

// The image type from the file's first bytes - some image hosts label
// photos as generic downloads (application/octet-stream).
export function sniffImageType(body) {
  if (body.length < 12) return null;
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (body.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (body.subarray(0, 4).toString("latin1") === "RIFF" && body.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (body.subarray(4, 12).toString("latin1").startsWith("ftypavif")) return "image/avif";
  return null;
}

// Each source's photos are asked for as if from its own pages.
function refererFor(url) {
  return /(^|\.)lerabais\.com$/i.test(new URL(url).hostname) ? "https://lerabais.com/" : "https://flipp.com/";
}

// { photo } on success, else { status?, contentType?, reason }.
async function fetchImage(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Referer: refererFor(url),
      },
    });
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!res.ok) return { status: res.status, contentType, reason: `answered ${res.status}` };
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0) return { status: res.status, contentType, reason: "sent an empty file" };
    if (body.length > MAX_BYTES) return { status: res.status, contentType, reason: "sent a file over 3 MB" };
    const type = contentType.startsWith("image/") && contentType !== "image/svg+xml" ? contentType : sniffImageType(body);
    if (!type) return { status: res.status, contentType, reason: `sent ${contentType || "something"} that isn't a photo` };
    return { photo: { type, body } };
  } catch (err) {
    return { reason: err.name === "AbortError" ? "took over 15 seconds" : `couldn't be reached (${err.cause?.code || err.message})` };
  } finally {
    clearTimeout(timer);
  }
}

export function clearDealPhotoCache() {
  cache.clear();
}
