import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { __messages, fail, langOf, msg } from "./i18n.js";

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

describe("server messages", () => {
  const en = flatten(__messages.en);
  const fr = flatten(__messages.fr);

  it("have the same keys and {placeholders} in French and English", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en)) expect([key, vars(fr[key])]).toEqual([key, vars(en[key])]);
  });

  it("every key the routes use exists", () => {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js")) files.push(p);
      }
    };
    walk(src);
    const missing = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/\b(?:fail|msg)\(\s*[\w.]+,\s*"([\w.]+)"/g)) if (!(m[1] in en)) missing.push(`${f}: ${m[1]}`);
      for (const m of text.matchAll(/"(scrape\.\w+)"/g)) if (!(m[1] in en)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it("answers in the language the app asks for, else the browser's, else French", () => {
    const req = (headers) => ({ headers, get: (h) => headers[h.toLowerCase()] });
    expect(langOf(req({ "x-lang": "en" }))).toBe("en");
    expect(langOf(req({ "x-lang": "fr", "accept-language": "en-US" }))).toBe("fr");
    expect(langOf(req({ "accept-language": "en-CA,en;q=0.9" }))).toBe("en");
    expect(langOf(req({ "accept-language": "de-DE" }))).toBe("fr");
    expect(langOf(req({}))).toBe("fr");
  });

  it("fills in values and returns a code with the error", () => {
    expect(msg("fr", "sectionExists", { name: "Frigo" })).toBe("Une section nommée « Frigo » existe déjà.");
    expect(msg("en", "sectionExists", { name: "Fridge" })).toBe('A section named "Fridge" already exists.');
    const req = { headers: { "x-lang": "fr" }, get: (h) => req.headers[h.toLowerCase()] };
    expect(fail(req, "wrongLogin")).toEqual({ error: "Courriel ou mot de passe incorrect.", code: "wrongLogin" });
  });
});
