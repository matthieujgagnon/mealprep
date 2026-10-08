import { t } from "../i18n/index.js";

// The Makeable page's section header (design: docs/design/riso-v2-makeable/). The
// cards themselves are MakeableCard.jsx.

// A section's header: title, count badge, a rule, and its description. The
// "week" section is collapsible (a chevron, closed by default).
export function SectionHeader({ id, count, open, onToggle }) {
  const title = (
    <>
      {onToggle && (
        <span className={`fnd-sec-chev${open ? "" : " closed"}`} aria-hidden="true" />
      )}
      <h2 className="fnd-sec-title">{t(`finder.sections.${id}`)}</h2>
      <span className={`fnd-sec-count ${id}`}>{count}</span>
    </>
  );
  return (
    <div className="fnd-sec-head">
      {onToggle ? (
        <button type="button" className="fnd-sec-toggle" aria-expanded={open} onClick={onToggle}>
          {title}
        </button>
      ) : (
        <div className="fnd-sec-toggle plain">{title}</div>
      )}
      <span className="fnd-sec-rule" aria-hidden="true" />
    </div>
  );
}
