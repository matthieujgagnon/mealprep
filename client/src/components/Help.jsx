import { useState } from "react";
import { dict, t, useLang } from "../i18n/index.js";

// The in-app guide: one section per screen, a FAQ and the outside sources.
// Every word lives in en.js / fr.js under "help" (the sections and answers
// are lists of sentences, so they're read from the dictionary directly).

const SECTION_IDS = [
  "home",
  "recipes",
  "recipeCard",
  "cookMode",
  "planner",
  "makeable",
  "grocery",
  "flyers",
  "inventory",
  "account",
];
const FAQ_IDS = ["flyers", "import", "groceryItem", "shelfLife", "language", "data"];

// What each source is used for is translated; so is Statistics Canada's name,
// its credit and its pages (a French page in French). The other names are
// the same in both languages (same.*), and so are their addresses.
const SOURCES = [
  {
    id: "statcan",
    name: "help.sources.statcan.name",
    hrefKey: "help.sources.statcan.tableUrl",
    licence: true,
  },
  { id: "usda", name: "same.usdaName", href: "https://www.foodsafety.gov/keep-food-safe/foodkeeper-app" },
  { id: "mealdb", name: "same.mealdb", href: "https://www.themealdb.com/" },
  { id: "flipp", name: "same.flipp", href: "https://flipp.com/" },
  { id: "leRabais", name: "same.leRabais", href: "https://lerabais.com/" },
  { id: "gemini", name: "same.gemini", href: "https://ai.google.dev/gemini-api" },
];

function jumpTo(id) {
  const el = document.getElementById(`help-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

function FaqItem({ id, open, onToggle, question, answer }) {
  const buttonId = `help-faq-q-${id}`;
  const panelId = `help-faq-a-${id}`;
  return (
    <div className={`riso-help-faq-item${open ? " open" : ""}`}>
      <h3 className="riso-help-faq-heading">
        <button
          type="button"
          id={buttonId}
          className="riso-help-faq-q"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{question}</span>
          <span className="riso-help-faq-mark" aria-hidden="true">
            {open ? "−" : "+"}
          </span>
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={buttonId} className="riso-help-faq-a" hidden={!open}>
        {answer.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

export function Help() {
  useLang(); // re-render when the language changes: the lists below come straight from the dictionary
  const [openFaq, setOpenFaq] = useState(() => new Set());
  const help = dict().help;

  function toggleFaq(id) {
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="riso-theme riso-help" data-theme="light">
      <div className="riso-recipes-heading">
        <div className="riso-eyebrow">{t("help.eyebrow")}</div>
        <h1 className="riso-recipes-title">
          {t("help.titleStart")} <span className="accent">{t("help.titleAccent")}</span>
        </h1>
        <p className="riso-help-intro">{t("help.intro")}</p>
      </div>

      <nav className="riso-chip-row riso-help-menu" aria-label={t("help.menuLabel")}>
        {[...SECTION_IDS, "faq", "credits"].map((id) => (
          <button key={id} type="button" className="riso-chip" onClick={() => jumpTo(id)}>
            {id === "faq" ? t("same.faq") : t(`help.nav.${id}`)}
          </button>
        ))}
      </nav>

      {SECTION_IDS.map((id) => (
        <section key={id} id={`help-${id}`} tabIndex={-1} className="riso-help-card" aria-labelledby={`help-${id}-title`}>
          <h2 id={`help-${id}-title`} className="riso-help-card-title">
            {t(`help.sections.${id}.title`)}
          </h2>
          <ul className="riso-help-lines">
            {help.sections[id].lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}

      <section id="help-faq" tabIndex={-1} className="riso-help-card" aria-labelledby="help-faq-title">
        <h2 id="help-faq-title" className="riso-help-card-title">
          {t("help.faqTitle")}
        </h2>
        <div className="riso-help-faq">
          {FAQ_IDS.map((id) => (
            <FaqItem
              key={id}
              id={id}
              open={openFaq.has(id)}
              onToggle={() => toggleFaq(id)}
              question={help.faq[id].q}
              answer={help.faq[id].a}
            />
          ))}
        </div>
      </section>

      <section id="help-credits" tabIndex={-1} className="riso-help-card" aria-labelledby="help-credits-title">
        <h2 id="help-credits-title" className="riso-help-card-title">
          {t("help.creditsTitle")}
        </h2>
        <p className="riso-help-credits-intro">{t("help.creditsIntro")}</p>
        <ul className="riso-help-sources">
          {SOURCES.map((source) => (
            <li key={source.id} className="riso-help-source">
              <h3 className="riso-help-source-name">{t(source.name)}</h3>
              <p>{t(`help.sources.${source.id}.use`)}</p>
              {source.licence && <p className="riso-help-licence">{t("help.sources.statcan.credit")}</p>}
              <a
                className="riso-btn riso-help-source-link"
                href={source.hrefKey ? t(source.hrefKey) : source.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("help.visit", { name: t(source.name) })} ↗
              </a>
              {source.licence && (
                <a
                  className="riso-btn riso-help-source-link"
                  href={t("help.sources.statcan.licenceUrl")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("help.sources.statcan.licenceLink")} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
