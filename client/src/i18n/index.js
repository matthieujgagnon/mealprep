// The app's two languages, French and English. Every word the app shows
// goes through t("screen.key"): the text lives in fr.js and en.js, which
// have the same keys (a test checks), so nothing is ever only in English.
//
// The language is picked once and remembered: the account's own choice
// (saved on the server, so it follows you to another device), else the
// last one used on this device, else the browser's, else French.
import { cloneElement, isValidElement, useSyncExternalStore } from "react";
import { en } from "./en.js";
import { fr } from "./fr.js";

export const LANGS = ["fr", "en"];
const DICTS = { fr, en };
const STORAGE_KEY = "mealprep-lang";

function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    // no storage: fall through to the browser
  }
  const prefs = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [];
  for (const p of prefs) {
    const base = String(p || "").slice(0, 2).toLowerCase();
    if (LANGS.includes(base)) return base;
  }
  return "fr";
}

let current = detect();
const listeners = new Set();

function applyToDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale();
  document.title = t("app.documentTitle");
}

export function getLang() {
  return current;
}

// "fr-CA" / "en-CA": for Intl dates, numbers and money.
export function locale(lang = current) {
  return lang === "fr" ? "fr-CA" : "en-CA";
}

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // best-effort
  }
  applyToDocument();
  listeners.forEach((fn) => fn(lang));
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-renders the component (and so everything under it) when the
// language changes.
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

// With a count, a key can hold { one, other } (French counts 0 and 1 as
// "one": "0 recette", "1 recette", "2 recettes").
function pick(entry, vars, lang) {
  if (entry && typeof entry === "object" && vars && vars.count != null) {
    const form = new Intl.PluralRules(locale(lang)).select(Number(vars.count));
    return entry[form] ?? entry.other;
  }
  return entry;
}

function resolve(key, vars, lang = current) {
  let entry = pick(lookup(DICTS[lang], key), vars, lang);
  if (typeof entry !== "string") {
    entry = pick(lookup(DICTS.en, key), vars, "en");
    if (typeof entry !== "string") {
      if (import.meta.env?.DEV) console.warn(`Missing translation: ${key}`);
      return key;
    }
  }
  return entry;
}

const TOKEN = /\{(\w+)\}/g;

// t("home.greeting", { name }) -> the text, with {name} filled in.
export function t(key, vars, lang = current) {
  const text = resolve(key, vars, lang);
  if (!vars) return text;
  return text.replace(TOKEN, (m, name) => (vars[name] == null ? m : String(vars[name])));
}

// Like t(), but a value can be a React element (a link, a bold word): the
// result is an array of strings and elements to drop into JSX.
export function tx(key, vars, lang = current) {
  const text = resolve(key, vars, lang);
  const parts = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const v = vars?.[m[1]];
    if (v == null) parts.push(m[0]);
    else if (isValidElement(v)) parts.push(cloneElement(v, { key: v.key ?? `tx${i++}` }));
    else parts.push(String(v));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// The dictionary itself (for lists such as day names).
export function dict(lang = current) {
  return DICTS[lang];
}

applyToDocument();
