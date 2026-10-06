import { useState } from "react";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { t } from "../i18n/index.js";

// The trash strip on a phone's Planner (design: docs/design/riso-v2-planner-
// mobile-v2, "Long-press drag"): while a planned card or note is held, a strip
// fixed to the bottom of the screen takes the place of the search bar. Dropping
// the card on it takes it off the plan, and App.jsx's drag setup removes it with
// the shared toast and its Undo (`planner-trash` in `handleDragEnd`). It shows
// only for a card already on the board, not for a recipe carried from the finder.
export const TRASH_ID = "planner-trash";

function TrashPill() {
  const { setNodeRef, isOver } = useDroppable({ id: TRASH_ID });
  return (
    <div className="pm-trash" role="presentation">
      <div ref={setNodeRef} className={`pm-trash-pill${isOver ? " over" : ""}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
        </svg>
        {isOver ? t("planner.trashRelease") : t("planner.trashHint")}
      </div>
    </div>
  );
}

export function TrashZone() {
  const [carrying, setCarrying] = useState(false);
  useDndMonitor({
    onDragStart: (event) => setCarrying(!!event.active.data.current?.entryId),
    onDragEnd: () => setCarrying(false),
    onDragCancel: () => setCarrying(false),
  });
  return carrying ? <TrashPill /> : null;
}
