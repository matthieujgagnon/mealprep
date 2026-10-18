import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The app has no "pantry staples" any more: salt, oil and spices are ordinary
// ingredients, had only when they are in Inventory. The PantryStaple table is
// still in the database, unused and untouched (the database is add-only: it is
// dropped later, as its own change, after a Neon snapshot). These tests fail if
// any code starts reading or writing it again, or a migration changes it.
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SELF = relative(root, fileURLToPath(import.meta.url));

function files(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

const code = (path) => /\.(js|jsx|mjs)$/.test(path) && relative(root, path) !== SELF;

describe("nothing touches the unused PantryStaple table", () => {
  it("no server, client or browser-test code mentions it", () => {
    const hits = [];
    for (const dir of ["server/src", "client/src", "e2e"]) {
      for (const path of files(join(root, dir), code)) {
        const text = readFileSync(path, "utf8");
        if (/pantry[-_ ]?staple/i.test(text)) hits.push(relative(root, path));
      }
    }
    expect(hits).toEqual([]);
  });

  it("the table stays in the schema, and only the first two migrations ever mention it", () => {
    const schema = readFileSync(join(root, "server/prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/^model PantryStaple \{/m);

    const migrations = readdirSync(join(root, "server/prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
    const mentioning = migrations.filter((name) => /PantryStaple/.test(readFileSync(join(root, "server/prisma/migrations", name, "migration.sql"), "utf8")));
    expect(mentioning).toEqual(["20260922004115_init", "20260922010000_add_unique_constraints"]);
  });
});
