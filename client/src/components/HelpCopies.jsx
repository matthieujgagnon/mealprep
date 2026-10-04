import { Fragment } from "react";
import { COPY_TOKEN, HELP_COPIES } from "../lib/helpCopies.js";
import { getLang, t } from "../i18n/index.js";

// Help sentences that show the real thing: where a line writes [[id]], this
// draws a small picture of that button, chip, icon or tab. The pictures are
// plain <span>s (never buttons or links), so they can't be tapped or focused
// and a screen reader just reads their words as part of the sentence. Glyph-
// only pictures are hidden from screen readers, because the sentence already
// names them. They wear the app's own CSS classes (see lib/helpCopies.js);
// the "riso-help-copy*" rules in index.css only shrink them to sentence size.

function Pill({ copy }) {
  return <span className={`${copy.cls} riso-help-copy-body`}>{t(copy.label, copy.vars)}</span>;
}

function Icon({ copy }) {
  return (
    <span className={`${copy.cls} riso-help-copy-body icon`} aria-hidden="true">
      {copy.glyph}
    </span>
  );
}

function Group({ copy }) {
  if (copy.switch) {
    return (
      <span className={copy.cls}>
        <span className="riso-switch on riso-help-copy-switch">
          <span className="riso-switch-knob" />
        </span>
        <span className="riso-help-copy-toggle-label">{t(copy.items[0].label)}</span>
      </span>
    );
  }
  return (
    <span className={copy.cls}>
      {copy.items.map((item) => (
        <span key={item.label} className={`riso-segment${item.active ? " active" : ""}`}>
          {t(item.label)}
        </span>
      ))}
    </span>
  );
}

function Verdict({ copy }) {
  return (
    <span className={`riso-verdict ${copy.tone} riso-help-copy-verdict`}>
      <b>{t(copy.label)}</b>
    </span>
  );
}

function Deal() {
  return (
    <span className="riso-row-deal riso-help-copy-body">
      <span className="riso-row-deal-store">{t("same.sampleStore")}</span>
      <span className="riso-row-deal-div" aria-hidden="true" />
      <span className="riso-row-deal-price">{t("help.sample.price")}</span>
    </span>
  );
}

function Removed() {
  return (
    <span className="riso-grocery-removed-chip riso-help-copy-body">
      {t("help.sample.item")} <span aria-hidden="true">↺</span>
    </span>
  );
}

function AtStore() {
  return (
    <span className="riso-grocery-store-btn riso-help-copy-body">
      {t("grocery.atStore")} <span>{t("grocery.bigMode")}</span>
    </span>
  );
}

function Lang() {
  const lang = getLang();
  return (
    <span className="riso-lang-switch riso-help-copy-lang">
      <span className={`riso-lang-seg${lang === "fr" ? " active" : ""}`}>{t("same.fr")}</span>
      <span className={`riso-lang-seg${lang === "en" ? " active" : ""}`}>{t("same.en")}</span>
    </span>
  );
}

function Avatar() {
  return (
    <span className="app-header-avatar-btn riso-help-copy-body icon" aria-hidden="true">
      {t("same.sampleInitial")}
    </span>
  );
}

const DRAW = { pill: Pill, icon: Icon, group: Group, verdict: Verdict, deal: Deal, removed: Removed, atStore: AtStore, lang: Lang, avatar: Avatar };

export function HelpCopy({ id }) {
  const copy = HELP_COPIES[id];
  const Draw = copy && DRAW[copy.kind];
  if (!Draw) return null;
  const classes = ["riso-help-copy", copy.strong && "strong", copy.onAccent && "on-accent", copy.dark && "on-dark"].filter(Boolean);
  return (
    <span className={classes.join(" ")}>
      <Draw copy={copy} />
    </span>
  );
}

// One sentence or list of sentences, with its [[id]] marks drawn as buttons.
// Punctuation right after a copy stays on its line (never a lone "." below).
export function HelpText({ text }) {
  const parts = text.split(COPY_TOKEN);
  return parts.map((part, i) => {
    if (i % 2) return null; // a copy: drawn with the text that follows it
    const copy = i > 0 ? <HelpCopy id={parts[i - 1]} /> : null;
    const [, punct = "", rest = part] = copy ? part.match(/^([.,;:!?)»]*)([\s\S]*)$/) : [];
    return (
      <Fragment key={i}>
        {copy && (punct ? <span className="riso-help-nowrap">{copy}{punct}</span> : copy)}
        {copy ? rest : part}
      </Fragment>
    );
  });
}
