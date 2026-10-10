// Baseline doc helpers: the app's own copy (client/src/i18n/en.js, fr.js, copied
// verbatim from the repo) and the t() rules from client/src/i18n/index.js.
import { en } from './client/src/i18n/en.js';
import { fr } from './client/src/i18n/fr.js';

const DICTS = { en, fr };
export const locale = (lang) => (lang === 'fr' ? 'fr-CA' : 'en-CA');

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}
function pick(entry, vars, lang) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && vars && vars.count != null) {
    const form = new Intl.PluralRules(locale(lang)).select(Number(vars.count));
    return entry[form] ?? entry.other;
  }
  return entry;
}
export function t(lang, key, vars) {
  let entry = pick(lookup(DICTS[lang], key), vars, lang);
  if (typeof entry !== 'string') entry = pick(lookup(DICTS.en, key), vars, 'en');
  if (typeof entry !== 'string') return key;
  if (!vars) return entry;
  return entry.replace(/\{(\w+)\}/g, (m, n) => (vars[n] == null ? m : String(vars[n])));
}
export const dict = (lang) => DICTS[lang];
export const tr = (lang) => (key, vars) => t(lang, key, vars);

// The artboards each state is drawn in: desktop 1280 and phone 390, per language.
export function boards(langPref, opts = {}) {
  const langs = langPref === 'en' ? ['en'] : langPref === 'fr' ? ['fr'] : ['en', 'fr'];
  const out = [];
  for (const lang of langs) {
    if (!opts.phoneOnly) out.push({ lang, phone: false, w: 1280, label: `DESKTOP · ${lang.toUpperCase()} · 1280` });
    if (!opts.desktopOnly) out.push({ lang, phone: true, w: 390, label: `PHONE · ${lang.toUpperCase()} · 390` });
  }
  return out;
}

export function money(lang, n) {
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' }).format(n);
}
