import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page and its images come from a fake fetch; the private-address check
// would otherwise try real DNS.
vi.mock("./urlSafety.js", () => ({ assertSafeRecipeUrl: async () => {} }));
const { scrapeRecipe } = await import("./scrapeRecipe.js");

function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

const PAGE = "https://food.example.com/creamy-pasta/";
const IMG = "https://food.example.com/wp-content/uploads/2026/09";

// A typical food blog: JSON-LD lists a square crop first, the share image
// is the landscape shot, and the recipe card lazy-loads a thumbnail whose
// full-size original sits next to it.
const html = `<!doctype html><html><head>
<meta property="og:image" content="${IMG}/creamy-pasta-social.jpg">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Creamy pasta",
  image: [`${IMG}/creamy-pasta-1x1.jpg`, `${IMG}/creamy-pasta-4x3.jpg`, `${IMG}/creamy-pasta-16x9.jpg`],
  recipeIngredient: ["200 g pasta", "1 cup cream"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Boil the pasta." }, { "@type": "HowToStep", text: "Add the cream." }],
})}</script>
</head><body>
<img src="${IMG}/site-logo.png" alt="logo">
<div class="wprm-recipe-container">
  <img src="data:image/svg+xml,%3Csvg%3E" data-lazy-src="${IMG}/sauce-300x200.jpg" width="300" height="200">
  <img src="${IMG}/author-headshot.jpg">
  <img src="${IMG}/icon-print.png">
</div>
</body></html>`;

const images = {
  [`${IMG}/creamy-pasta-1x1.jpg`]: jpeg(500, 500),
  [`${IMG}/creamy-pasta-4x3.jpg`]: jpeg(1200, 900),
  [`${IMG}/creamy-pasta-16x9.jpg`]: jpeg(1200, 675),
  [`${IMG}/creamy-pasta-social.jpg`]: jpeg(1200, 630),
  [`${IMG}/sauce-300x200.jpg`]: jpeg(300, 200),
  [`${IMG}/sauce.jpg`]: jpeg(2400, 1600),
};

beforeEach(() => {
  vi.stubGlobal("fetch", async (url) => {
    if (url === PAGE) return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    if (images[url]) return new Response(images[url], { status: 206, headers: { "content-type": "image/jpeg" } });
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("scrapeRecipe photos", () => {
  it("picks the big landscape recipe photo and full-size gallery photos, skipping site chrome", async () => {
    const recipe = await scrapeRecipe(PAGE);
    expect(recipe.title).toBe("Creamy pasta");
    expect(recipe.photoUrl).toBe(`${IMG}/creamy-pasta-4x3.jpg`);
    expect(recipe.photos).toEqual([
      `${IMG}/creamy-pasta-4x3.jpg`,
      `${IMG}/creamy-pasta-social.jpg`,
      `${IMG}/sauce.jpg`,
    ]);
  });

  it("falls back to the share image when the recipe data has none", async () => {
    const noImage = html.replace(/"image":\[[^\]]*\],/, "");
    vi.stubGlobal("fetch", async (url) => {
      if (url === PAGE) return new Response(noImage, { status: 200, headers: { "content-type": "text/html" } });
      if (images[url]) return new Response(images[url], { status: 206, headers: { "content-type": "image/jpeg" } });
      return new Response("", { status: 404 });
    });
    const recipe = await scrapeRecipe(PAGE);
    expect(recipe.photoUrl).toBe(`${IMG}/creamy-pasta-social.jpg`);
  });
});
