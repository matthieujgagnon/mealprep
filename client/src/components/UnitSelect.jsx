import { UNIT_GROUPS, unitOptionLabel } from "../lib/units.js";
import { t } from "../i18n/index.js";

// The unit dropdown for an amount, grouped (Count / Package / Volume /
// Weight / A little). A unit saved before it was on this list still shows
// as its own option, so opening an old recipe never blanks it.
export function UnitSelect({ value, onChange, emptyLabel = t("units.none"), ...rest }) {
  const known = UNIT_GROUPS.some((g) => g.units.includes(value));
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{emptyLabel}</option>
      {value && !known && <option value={value}>{value}</option>}
      {UNIT_GROUPS.map((group) => (
        <optgroup key={group.id} label={group.label}>
          {group.units.map((u) => (
            <option key={u} value={u}>
              {unitOptionLabel(u)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
