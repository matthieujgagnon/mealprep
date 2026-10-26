import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { t } from "../i18n/index.js";
import {
  bodyOf,
  draftForGap,
  draftForRow,
  guessGender,
  guessPlural,
  matcherNotes,
  problemWith,
} from "../lib/ingredientNameForm.js";
import { cleanOverride } from "../lib/ingredientTable.js";
import { Popup, Segmented } from "./RisoControls.jsx";

// The form on the Admin page's Ingredient names card: an ingredient's English and French names,
// singular and plural, and its gender in French. It opens for a name from a recipe that has no
// translation yet (`gap`, started with good guesses from lib/ingredientNameForm.js) or for a
// row of the table (`card`: a built-in row, one Matt changed or added, or a hidden one). It is
// the shared Popup (the bottom sheet on a phone). It checks what was typed with the same rules
// the server runs (lib/ingredientTable.js), and hands the checked names to `onSave`; the card
// saves them (lib/nameSaves.js) and shows the toast with Undo.
//
//   gap        { name, recipes } or null
//   card       a row from `cardRows` or null
//   overrides  every change now kept (so a name another row already has is refused)
//   onSave     called with { data, ref } (`data` is what cleanOverride checked)
//   onBack     "Back to built-in" / "Remove" (a changed or added row, or a hidden one)
//   onHide     "Hide this built-in name" (a built-in row)
//   onClose

const SIDES = [
  { lang: "en", title: "english" },
  { lang: "fr", title: "french" },
];

export function IngredientNameForm({ gap, card, overrides, onSave, onBack, onHide, onClose }) {
  const isPhone = useIsPhone();
  const existing = Boolean(card);
  const replaces = card?.built?.key || null;
  const self = card?.override || null;
  const [draft, setDraft] = useState(() => (card ? draftForRow(card.row) : draftForGap(gap?.name)));
  // A plural or a gender that was typed (or came with the row) is not guessed again.
  const [typed, setTyped] = useState(() => new Set(existing ? ["enOther", "frOther", "gender"] : []));
  const [attempted, setAttempted] = useState(false);
  const firstRef = useRef(null);

  // A name with nothing yet starts with the cursor where it is missing (a row being corrected
  // does not, so a phone's keyboard does not cover it).
  useEffect(() => {
    if (gap) firstRef.current?.focus();
  }, [gap]);

  function change(field, value) {
    setDraft((now) => {
      const next = { ...now, [field]: value };
      if (field === "enOne" && !typed.has("enOther")) next.enOther = guessPlural(value, "en") === value ? "" : guessPlural(value, "en");
      if (field === "frOne" && !typed.has("frOther")) next.frOther = guessPlural(value, "fr") === value ? "" : guessPlural(value, "fr");
      if (field === "frOne" && !typed.has("gender")) next.gender = guessGender(value);
      return next;
    });
    if (field !== "enOne" && field !== "frOne") setTyped((now) => new Set(now).add(field));
  }

  const problem = useMemo(() => problemWith(draft, { replaces, overrides, self }), [draft, replaces, overrides, self]);
  const shownProblem = problem && (problem.live || attempted) ? problem : null;
  // What the Inventory matcher (« J'en ai ») makes of the names: notes, never a stop.
  const notes = useMemo(() => matcherNotes(draft, { replaces, overrides, self }), [draft, replaces, overrides, self]);

  function save(event) {
    event.preventDefault();
    if (problem) {
      setAttempted(true);
      return;
    }
    const { data } = cleanOverride(bodyOf(draft, replaces));
    onSave({ data, ref: card?.ref });
  }

  const title = t(existing ? "admin.names.form.titleEdit" : "admin.names.form.titleNew");
  const intro = gap
    ? t("admin.names.form.introGap", { count: gap.recipes })
    : t(
        {
          "built-in": "admin.names.form.introBuiltIn",
          changed: "admin.names.form.introChanged",
          added: "admin.names.form.introAdded",
          hidden: "admin.names.form.introHidden",
        }[card.status]
      );
  // The side that has nothing yet is where the cursor starts.
  const missing = draft.enOne ? "frOne" : "enOne";

  return createPortal(
    <div className="riso-theme riso-namepop-layer" data-theme="light">
      <Popup label={title} onClose={onClose} isPhone={isPhone} narrow>
        <form className="riso-namepop" onSubmit={save} noValidate>
          <header className="riso-namepop-head">
            <h2 className="riso-namepop-title">{title}</h2>
            <p className="riso-namepop-intro">{intro}</p>
          </header>

          {SIDES.map(({ lang, title: heading }) => (
            <fieldset key={lang} className="riso-namepop-lang">
              <legend>{t(`admin.names.form.${heading}`)}</legend>
              <div className="riso-namepop-pair">
                <label className="riso-namepop-field">
                  <span>{t("admin.names.form.singular")}</span>
                  <input
                    ref={missing === `${lang}One` ? firstRef : null}
                    name={`${lang}One`}
                    lang={lang === "fr" ? "fr-CA" : "en-CA"}
                    value={draft[`${lang}One`]}
                    onChange={(e) => change(`${lang}One`, e.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                  />
                </label>
                <label className="riso-namepop-field">
                  <span>{t("admin.names.form.plural")}</span>
                  <input
                    name={`${lang}Other`}
                    lang={lang === "fr" ? "fr-CA" : "en-CA"}
                    value={draft[`${lang}Other`]}
                    placeholder="="
                    onChange={(e) => change(`${lang}Other`, e.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                  />
                </label>
              </div>
            </fieldset>
          ))}
          <p className="riso-namepop-hint">
            {t("admin.names.form.pluralHint")}. {t("admin.names.form.spellingsHint")}
          </p>

          <div className="riso-namepop-gender" role="group" aria-label={t("admin.names.form.gender")}>
            <span className="riso-namepop-gender-label">{t("admin.names.form.gender")}</span>
            <Segmented
              ariaLabel={t("admin.names.form.gender")}
              value={draft.gender}
              onChange={(value) => change("gender", value)}
              options={[
                { id: "m", label: t("admin.names.form.masculine") },
                { id: "f", label: t("admin.names.form.feminine") },
              ]}
            />
            <label className="riso-namepop-check">
              <input type="checkbox" checked={draft.always} onChange={(e) => setDraft((now) => ({ ...now, always: e.target.checked }))} />
              <span>{t("admin.names.form.alwaysPlural")}</span>
            </label>
          </div>

          {shownProblem && (
            <p className="riso-namepop-error" role="alert">
              {t(`admin.names.error.${shownProblem.error}`, shownProblem.vars)}
            </p>
          )}

          {(problem?.live ? [] : notes).map((note) => (
            <p key={`${note.kind}:${note.form || note.english}`} className="riso-namepop-warn" role="status">
              {t(`admin.names.warn.${note.kind}`, note)}
            </p>
          ))}

          <div className="riso-namepop-actions">
            <button type="button" className="riso-btn" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="riso-btn primary" disabled={Boolean(problem?.live)}>
              {t("admin.names.form.save")}
            </button>
          </div>

          {existing && (
            <div className="riso-namepop-more">
              {(card.status === "changed" || card.status === "hidden") && (
                <button type="button" className="riso-btn small" onClick={onBack}>
                  {t("admin.names.form.backToBuiltIn")}
                </button>
              )}
              {card.status === "added" && (
                <button type="button" className="riso-btn small" onClick={onBack}>
                  {t("admin.names.form.remove")}
                </button>
              )}
              {card.status === "built-in" && (
                <>
                  <button type="button" className="riso-btn small" onClick={onHide}>
                    {t("admin.names.form.hide")}
                  </button>
                  <p className="riso-namepop-hint">{t("admin.names.form.hideHint")}</p>
                </>
              )}
            </div>
          )}
        </form>
      </Popup>
    </div>,
    document.body
  );
}
