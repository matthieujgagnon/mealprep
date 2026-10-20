import { describe, expect, it } from "vitest";
import { photoUrl, realPhoto } from "./itemPhoto.js";

describe("photoUrl", () => {
  it("reads an uploaded photo, a web link, none, and nothing", () => {
    expect(photoUrl(undefined)).toBeUndefined();
    expect(photoUrl(null)).toBeNull();
    expect(photoUrl("")).toBeNull();
    expect(photoUrl("none")).toBe("none");
    expect(photoUrl("/api/recipe-images/abc-123")).toBe("/api/recipe-images/abc-123");
    expect(photoUrl(" https://example.com/lasagne.jpg ")).toBe("https://example.com/lasagne.jpg");
  });

  it("refuses anything that is not a photo", () => {
    expect(photoUrl("javascript:alert(1)")).toBe(false);
    expect(photoUrl("/etc/passwd")).toBe(false);
    expect(photoUrl(`https://example.com/${"a".repeat(2001)}`)).toBe(false);
  });
});

describe("realPhoto", () => {
  it("is the address to draw, or null", () => {
    expect(realPhoto("/api/recipe-images/abc")).toBe("/api/recipe-images/abc");
    expect(realPhoto("none")).toBeNull();
    expect(realPhoto(null)).toBeNull();
    expect(realPhoto(undefined)).toBeNull();
    expect(realPhoto("nope")).toBeNull();
  });
});
