import {
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDndMonitor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// The one way to move a whole section: Grocery's stores (By store) and Inventory's
// shelves. You pick it up by its ⠿ grip, it lifts and follows the pointer, the
// others slide to make room, and where you let go it lands. What a drop does (the
// saving) is each page's own: this piece only does the moving.
//
// A page gives each section `useReorderSection({ id, data })` and wraps them in
// `<ReorderList ids={...}>`. The page's drag setup (a `DndContext`) must have
// sensors that pick a grip up the way `useReorderSensors` does: Grocery's own
// context uses that hook, and the app's one context (Inventory's shelves) uses
// `GripAwarePointerSensor` in `App.jsx`. A page lays its sections out
// one per row (`verticalListSortingStrategy`, Grocery's stores, a phone) or on a
// grid of different widths (`gridSortingStrategy` in lib/reorderGrid.js,
// Inventory's shelves).

// How a grip is picked up, the same on every page: a mouse after 6px of movement,
// a finger after a still hold (a touch that starts on the grip never scrolls the
// page, `touch-action: none`, so there is nothing for a swipe to be mistaken for).
export const REORDER_MOUSE = { distance: 6 };
export const REORDER_TOUCH = { delay: 250, tolerance: 8 };

export function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: REORDER_MOUSE }),
    useSensor(TouchSensor, { activationConstraint: REORDER_TOUCH })
  );
}

// For a drag setup that already has one pointer sensor for everything else (the
// app's, which holds still for 200 ms before anything else is picked up): the
// same sensor, but a press that starts on a grip is picked up the grip's way.
// (Two pointer sensors cannot share one drag setup: the second one replaces the first.)
export const GRIP_ATTRIBUTE = "data-reorder-grip";
export class GripAwarePointerSensor extends PointerSensor {
  constructor(props) {
    const onGrip = !!props.event.target?.closest?.(`[${GRIP_ATTRIBUTE}]`);
    super(onGrip ? { ...props, options: { ...props.options, activationConstraint: REORDER_MOUSE } } : props);
  }
}

// Which section a carried one is over: the one under the pointer, whatever its
// width, else the nearest by its middle. (Grocery's stores, one per row, take the
// nearest middle alone.) `type` is the `data.type` the page gave its sections.
export function sectionCollision(args, type) {
  const droppableContainers = args.droppableContainers.filter((c) => c.data.current?.type === type);
  const narrowed = { ...args, droppableContainers };
  const within = pointerWithin(narrowed);
  return within.length > 0 ? within : closestCenter(narrowed);
}

// One section: its ref, the style that slides it (or carries it), whether it is the
// lifted one, and its grip (ref + props, for <ReorderGrip>).
export function useReorderSection({ id, data }) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging, isOver, active } =
    useSortable({ id, data });
  return {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    lifted: isDragging,
    // Something else being carried is over this section (the page tells an item from a section by `active`).
    isOver,
    active,
    grip: { ref: setActivatorNodeRef, props: { ...listeners, ...attributes, [GRIP_ATTRIBUTE]: "" } },
  };
}

// The class a section wears while it is the lifted one (see `.reorder-lifted` in index.css).
export const LIFTED_CLASS = "reorder-lifted";

// The ⠿ that carries a section: a span (Grocery's heading), or with `asButton` a
// button (a shelf's, which the arrow keys move too). Anything else (label, title,
// key handlers) goes on it.
export function ReorderGrip({ grip, asButton = false, className = "", ...rest }) {
  const Tag = asButton ? "button" : "span";
  return (
    <Tag ref={grip.ref} className={`reorder-grip ${className}`.trim()} {...(asButton ? { type: "button" } : {})} {...grip.props} {...rest}>
      ⠿
    </Tag>
  );
}

// The sections of one list, in the order they are shown.
export function ReorderList({ ids, strategy = verticalListSortingStrategy, children }) {
  return (
    <SortableContext items={ids} strategy={strategy}>
      {children}
    </SortableContext>
  );
}

// For a page inside the app's drag setup: runs `onMove(carried, target)` (each one's
// `data` from `useReorderSection`) when a section of `type` is dropped on another.
export function useReorderDrop(type, onMove) {
  useDndMonitor({
    onDragEnd: ({ active, over }) => {
      if (active.data.current?.type !== type || !over || over.id === active.id) return;
      onMove(active.data.current, over.data.current);
    },
  });
}
