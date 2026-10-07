// Finds English typed straight into JSX (instead of going through t()).
// Used by i18n.test.js, and handy from the command line:
//   node client/src/i18n/scan.js   (lists every hit)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
export const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(jsx?|mjs)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) out.push(p);
  }
  return out;
}

// Attributes that are never shown to anyone.
const SILENT_ATTRS = new Set([
  "className", "type", "role", "id", "name", "href", "src", "rel", "target", "inputMode", "autoComplete",
  "key", "style", "accept", "method", "htmlFor", "viewBox", "d", "fill", "stroke", "strokeWidth", "loading",
  "width", "height", "xmlns", "points", "cx", "cy", "r", "x", "y", "x1", "x2", "y1", "y2", "pattern", "step",
  "min", "max", "lang", "dir", "draggable", "tabIndex", "enterKeyHint", "capture", "autoCapitalize", "spellCheck",
  "referrerPolicy", "decoding", "crossOrigin", "screenKey", "tone", "kicker", "variant", "size", "mode", "layout", "value",
  "defaultValue", "aria-hidden", "aria-live", "aria-modal", "aria-pressed", "aria-expanded", "aria-checked",
  "aria-selected", "aria-controls", "aria-describedby", "aria-labelledby", "aria-current", "aria-haspopup",
  "aria-orientation", "aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-busy", "aria-invalid",
  "sizes", "colSpan", "rowSpan", "scope", "list", "form", "wrap", "rows", "cols", "maxLength", "minLength",
  "inputmode", "autoFocus", "disabled", "checked", "readOnly", "required", "multiple", "open", "hidden",
  "preserveAspectRatio", "strokeLinecap", "strokeLinejoin", "fillRule", "clipRule", "transform", "offset",
  "stopColor", "gradientTransform", "aria-roledescription", "download", "data", "icon", "shape",
]);

const LETTERS = /\p{L}{2,}/u;
// A web address shown as an example ("https://…") reads the same everywhere.
const URL_ONLY = /^https?:\/\/\S*$/;
const isText = (s) => LETTERS.test(s) && !URL_ONLY.test(s.trim());
// The wordmark is a name, the same in both languages.
const BRAND = /^(matt mo|cookbook)$/;

// JSX text, user-facing attributes and string literals shown in JSX that
// aren't run through t().
export function hardCodedTexts(file) {
  const src = fs.readFileSync(file, "utf8");
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const found = [];
  const add = (node, text) => found.push(`${path.relative(SRC, file)}:${node.loc.start.line}  ${text.trim().slice(0, 80)}`);
  const inJsxChild = (p) => {
    // A string literal whose value is rendered: inside a {...} that is a
    // child of an element, directly or as a branch of ?:, a right side of
    // && / ||, a piece of a template or a + concatenation (not a test or a
    // comparison).
    let cur = p;
    while (cur.parentPath) {
      const parent = cur.parentPath;
      if (parent.isJSXExpressionContainer()) return parent.parentPath.isJSXElement() || parent.parentPath.isJSXFragment();
      if (parent.isConditionalExpression()) {
        if (parent.node.test === cur.node) return false;
      } else if (parent.isLogicalExpression()) {
        if (parent.node.left === cur.node && parent.node.operator === "&&") return false;
      } else if (parent.isBinaryExpression()) {
        if (parent.node.operator !== "+") return false;
      } else if (!parent.isTemplateLiteral()) {
        return false;
      }
      cur = parent;
    }
    return false;
  };
  traverse(ast, {
    JSXText(p) {
      const text = p.node.value.replace(/\s+/g, " ").trim();
      if (LETTERS.test(text) && !BRAND.test(text)) add(p.node, text);
    },
    JSXAttribute(p) {
      const name = p.node.name.name;
      if (typeof name !== "string" || SILENT_ATTRS.has(name) || name.startsWith("data-") || name.startsWith("on")) return;
      const v = p.node.value;
      if (!v) return;
      if (v.type === "StringLiteral" && isText(v.value)) add(v, `${name}="${v.value}"`);
      if (v.type === "JSXExpressionContainer") {
        const e = v.expression;
        if (e.type === "StringLiteral" && isText(e.value)) add(e, `${name}={"${e.value}"}`);
        if (e.type === "TemplateLiteral" && e.quasis.some((q) => LETTERS.test(q.value.cooked))) add(e, `${name}={\`${e.quasis.map((q) => q.value.cooked).join("…")}\`}`);
        if (e.type === "ConditionalExpression") {
          for (const branch of [e.consequent, e.alternate]) {
            if (branch.type === "StringLiteral" && isText(branch.value)) add(branch, `${name}=… "${branch.value}"`);
          }
        }
      }
    },
    StringLiteral(p) {
      if (isText(p.node.value) && inJsxChild(p)) add(p.node, `"${p.node.value}"`);
    },
    TemplateLiteral(p) {
      if (p.node.quasis.some((q) => LETTERS.test(q.value.cooked)) && inJsxChild(p)) {
        add(p.node, `\`${p.node.quasis.map((q) => q.value.cooked).join("…")}\``);
      }
    },
  });
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let total = 0;
  for (const f of sourceFiles().filter((f) => f.endsWith(".jsx"))) {
    const hits = hardCodedTexts(f);
    total += hits.length;
    for (const h of hits) console.log(h);
  }
  console.log(`${total} hard-coded texts`);
}
