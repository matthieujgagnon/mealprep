import { describe, expect, it } from "vitest";
import { flyerUrl, merchantMatches } from "./flyerLinks.js";

describe("flyerUrl", () => {
  it("uses the chain's own flyer page when known", () => {
    expect(flyerUrl("Super C")).toBe("https://www.superc.ca/en/flyer");
    expect(flyerUrl("Metro Plus")).toBe("https://www.metro.ca/en/flyer");
    expect(flyerUrl("IGA extra")).toBe("https://www.iga.net/en/flyer");
  });
  it("falls back to Flipp near the postal code", () => {
    expect(flyerUrl("Adonis", "h2t 2s3")).toBe("https://flipp.com/en-ca/search/Adonis?postal_code=H2T2S3");
  });
});

describe("merchantMatches", () => {
  it("ties a picked store to its Flipp merchant", () => {
    expect(merchantMatches("SUPER C (Montreal)", "Super C")).toBe(true);
    expect(merchantMatches("IGA extra", "IGA")).toBe(true);
    expect(merchantMatches("BIGAR", "IGA")).toBe(false);
  });
});
