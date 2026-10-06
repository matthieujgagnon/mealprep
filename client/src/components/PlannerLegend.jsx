import { t } from "../i18n/index.js";

// The legend under the Planner board, on every size (design:
// docs/design/riso-v2-planner-header). What the board's cards and cells look
// like, in this order: planned meal, ingredients on hand (blue outline),
// leftovers (yellow tag), note, empty slot, today, and the weekend (only when
// the board shows one).
export function PlannerLegend({ weekendOn }) {
  return (
    <div className="plg">
      <span className="plg-item">
        <i className="plg-swatch meal" aria-hidden="true" />
        {t("planner.legendMeal")}
      </span>
      <span className="plg-item">
        <i className="plg-swatch have" aria-hidden="true" />
        {t("planner.legendHave")}
      </span>
      <span className="plg-item">
        <i className="plg-swatch leftover" aria-hidden="true">
          {t("planner.leftover")}
        </i>
        {t("planner.legendLeftover")}
      </span>
      <span className="plg-item">
        <i className="plg-swatch note" aria-hidden="true" />
        {t("planner.legendNote")}
      </span>
      <span className="plg-item">
        <i className="plg-swatch empty" aria-hidden="true" />
        {t("planner.legendEmpty")}
      </span>
      <span className="plg-item">
        <i className="plg-swatch today" aria-hidden="true" />
        {t("planner.legendTodayName")}
      </span>
      {weekendOn && (
        <span className="plg-item">
          <i className="plg-swatch weekend" aria-hidden="true" />
          {t("planner.legendWeekend")}
        </span>
      )}
    </div>
  );
}
