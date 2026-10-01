import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDealPhoto, clearDealPhotoCache, isFetchableImageUrl, loadDealPhoto } from "./dealPhoto.js";

const image = (type = "image/jpeg", status = 200) => ({
  ok: status < 400,
  status,
  headers: { get: () => type },
  arrayBuffer: async () => new Uint8Array(JPEG).buffer,
});
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1];

describe("loadDealPhoto", () => {
  beforeEach(() => clearDealPhotoCache());

  it("fetches as if from the image's own site, and caches it", async () => {
    const fetchImpl = vi.fn(async () => image());
    const photo = await loadDealPhoto("https://f.wishabi.net/page_items/1/cutout.jpg", { fetchImpl });
    expect(photo.type).toBe("image/jpeg");
    expect(photo.body.length).toBe(JPEG.length);
    expect(fetchImpl.mock.calls[0][1].headers.Referer).toBe("https://flipp.com/");
    await loadDealPhoto("https://f.wishabi.net/page_items/1/cutout.jpg", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tries plain http links over https first, then as given", async () => {
    const fetchImpl = vi.fn(async (url) => (url.startsWith("https:") ? image("text/html", 404) : image("image/png")));
    const photo = await loadDealPhoto("http://lerabais.com/images/weekly-groceries/a.jpg", { fetchImpl });
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "https://lerabais.com/images/weekly-groceries/a.jpg",
      "http://lerabais.com/images/weekly-groceries/a.jpg",
    ]);
    expect(photo.type).toBe("image/png");
  });

  it("recognizes a photo labelled as a generic download", async () => {
    const photo = await loadDealPhoto("https://f.wishabi.net/x.jpg", { fetchImpl: async () => image("binary/octet-stream") });
    expect(photo.type).toBe("image/jpeg");
  });

  it("says why a photo couldn't be fetched", async () => {
    const result = await checkDealPhoto("http://f.wishabi.net/y.jpg", { fetchImpl: async () => image("text/html", 403) });
    expect(result.ok).toBe(false);
    expect(result.tries.map((t) => [t.url, t.reason])).toEqual([
      ["https://f.wishabi.net/y.jpg", "answered 403"],
      ["http://f.wishabi.net/y.jpg", "answered 403"],
    ]);
  });

  it("returns null for pages, errors and unreachable hosts", async () => {
    const page = { ...image("text/html"), arrayBuffer: async () => new TextEncoder().encode("<html>nope</html>").buffer };
    expect(await loadDealPhoto("https://x.test/a.jpg", { fetchImpl: async () => page })).toBeNull();
    expect(await loadDealPhoto("https://x.test/b.jpg", { fetchImpl: async () => image("image/jpeg", 403) })).toBeNull();
    expect(
      await loadDealPhoto("https://x.test/c.jpg", {
        fetchImpl: async () => {
          throw new Error("down");
        },
      })
    ).toBeNull();
  });

  it("never fetches local or private addresses", async () => {
    for (const url of ["http://127.0.0.1:9/a.jpg", "http://localhost/a.jpg", "http://10.0.0.5/a.jpg", "http://192.168.1.2/a.jpg", "file:///etc/passwd", "not a url"]) {
      expect(isFetchableImageUrl(url)).toBe(false);
    }
    expect(isFetchableImageUrl("https://lerabais.com/images/weekly-groceries/a.jpg")).toBe(true);
  });
});
