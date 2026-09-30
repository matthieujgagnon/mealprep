import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { candidatesFromImg, originalOf, parseSrcset, photoIdentity, readImageSize, selectPhotos } from "./recipePhotos.js";

const BASE = "https://blog.example.com/recipes/pasta/";

function png(width, height) {
  const buf = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpeg(width, height) {
  // SOI, an APP0 segment to skip, then SOF0 with the size.
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

// A fake image check: sizes by URL, anything else is a 404.
function fakeProbe(sizes) {
  return async (url) => (sizes[url] ? { ok: true, ...sizes[url] } : { ok: false });
}

describe("readImageSize", () => {
  it("reads PNG and JPEG headers", () => {
    expect(readImageSize(png(1200, 800))).toEqual({ width: 1200, height: 800 });
    expect(readImageSize(jpeg(1600, 900))).toEqual({ width: 1600, height: 900 });
    expect(readImageSize(Buffer.from("<html>not an image</html>........"))).toBeNull();
  });
});

describe("srcset and URL helpers", () => {
  it("orders srcset entries biggest first", () => {
    const list = parseSrcset("a-300x200.jpg 300w, a-1024x683.jpg 1024w, a.jpg 2048w", BASE);
    expect(list.map((c) => c.w)).toEqual([2048, 1024, 300]);
    expect(list[0].url).toBe("https://blog.example.com/recipes/pasta/a.jpg");
  });

  it("groups sizes and crops of one photo, and finds WordPress originals", () => {
    expect(photoIdentity("https://x.com/wp/pasta-1200x800.jpg")).toBe(photoIdentity("https://x.com/wp/pasta.jpg"));
    expect(photoIdentity("https://x.com/wp/pasta-16x9.jpg?w=500")).toBe(photoIdentity("https://x.com/wp/pasta.jpg"));
    expect(originalOf("https://x.com/wp/pasta-300x200.jpg")).toBe("https://x.com/wp/pasta.jpg");
    expect(originalOf("https://x.com/wp/pasta-16x9.jpg")).toBeNull();
  });

  it("reads lazy-loaded images instead of their placeholder", () => {
    const $ = cheerio.load(
      '<img src="data:image/gif;base64,R0l" data-lazy-src="/img/soup-300x200.jpg" data-lazy-srcset="/img/soup-300x200.jpg 300w, /img/soup-1024x683.jpg 1024w" width="300" height="200">'
    );
    const [best] = candidatesFromImg($, $("img").get(0), BASE);
    expect(best.url).toBe("https://blog.example.com/img/soup-1024x683.jpg");
    expect(best.width).toBe(1024);
  });
});

describe("selectPhotos", () => {
  it("picks a big landscape version of the recipe's own photo, not the square crop", async () => {
    const result = await selectPhotos(
      [
        { url: "https://cdn.x.com/pasta-1x1.jpg", source: "ld" },
        { url: "https://cdn.x.com/pasta-4x3.jpg", source: "ld" },
        { url: "https://cdn.x.com/pasta-16x9.jpg", source: "ld" },
      ],
      {
        probe: fakeProbe({
          "https://cdn.x.com/pasta-1x1.jpg": { width: 500, height: 500 },
          "https://cdn.x.com/pasta-4x3.jpg": { width: 1200, height: 900 },
          "https://cdn.x.com/pasta-16x9.jpg": { width: 1200, height: 675 },
        }),
      }
    );
    expect(result.photoUrl).toBe("https://cdn.x.com/pasta-4x3.jpg");
    expect(result.photos).toEqual(["https://cdn.x.com/pasta-4x3.jpg"]);
  });

  it("uses the full-size original when a WordPress thumbnail is all the page shows", async () => {
    const result = await selectPhotos([{ url: "https://x.com/wp/stew-300x200.jpg", source: "dom" }], {
      probe: fakeProbe({
        "https://x.com/wp/stew-300x200.jpg": { width: 300, height: 200 },
        "https://x.com/wp/stew.jpg": { width: 2000, height: 1333 },
      }),
    });
    expect(result.photoUrl).toBe("https://x.com/wp/stew.jpg");
  });

  it("falls back to the share image, and drops broken links and tiny images", async () => {
    const result = await selectPhotos(
      [
        { url: "https://x.com/gone.jpg", source: "ld" },
        { url: "https://x.com/share.jpg", source: "meta" },
        { url: "https://x.com/tiny.jpg", source: "dom" },
        { url: "https://x.com/step-2.jpg", source: "dom" },
        { url: "https://x.com/site-logo.png", source: "dom" },
      ],
      {
        exclude: ["https://x.com/step-2.jpg"],
        probe: fakeProbe({
          "https://x.com/share.jpg": { width: 1200, height: 630 },
          "https://x.com/tiny.jpg": { width: 80, height: 80 },
          "https://x.com/step-2.jpg": { width: 900, height: 600 },
          "https://x.com/site-logo.png": { width: 900, height: 600 },
        }),
      }
    );
    expect(result.photoUrl).toBe("https://x.com/share.jpg");
    expect(result.photos).toEqual(["https://x.com/share.jpg"]);
  });

  it("keeps photos the site wouldn't let us check, after the checked ones", async () => {
    const result = await selectPhotos(
      [
        { url: "https://x.com/hero.jpg", source: "ld" },
        { url: "https://x.com/more.jpg", source: "dom" },
      ],
      { probe: async () => null }
    );
    expect(result.photoUrl).toBe("https://x.com/hero.jpg");
    expect(result.photos).toEqual(["https://x.com/hero.jpg", "https://x.com/more.jpg"]);
  });
});
