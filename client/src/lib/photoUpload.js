import { api } from "../api.js";

const MAX_EDGE = 1600;

// Shrinks a photo to at most 1600px on its long edge (JPEG) before upload -
// phone photos are often 5-10 MB. GIFs are sent as-is to keep animation.
async function shrink(file) {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob || file;
}

// Uploads a picked or dropped image file and returns the URL to store.
export async function uploadPhoto(file) {
  const blob = await shrink(file);
  const { url } = await api.uploadRecipeImage(blob);
  return url;
}

export function isImageFile(file) {
  return /^image\/(jpeg|png|webp|gif)$/.test(file?.type || "");
}

// The image a drag from another page carries: a link, or an <img> in HTML.
export function droppedImageUrl(dataTransfer) {
  const uri = (dataTransfer.getData("text/uri-list") || "").split("\n").find((l) => l && !l.startsWith("#"));
  if (uri && /^https?:/i.test(uri.trim())) return uri.trim();
  const html = dataTransfer.getData("text/html");
  const src = html && html.match(/<img[^>]+src="([^"]+)"/i)?.[1];
  if (src && /^https?:/i.test(src)) return src.replace(/&amp;/g, "&");
  const text = (dataTransfer.getData("text/plain") || "").trim();
  return /^https?:\/\/\S+$/i.test(text) ? text : null;
}
