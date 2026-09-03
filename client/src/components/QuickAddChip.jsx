import { useDraggable } from "@dnd-kit/core";

export function QuickAddChip({ recipe }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `recipe-${recipe.id}`,
    data: { recipe },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`quick-add-chip${isDragging ? " dragging" : ""}`}
      {...listeners}
      {...attributes}
    >
      {recipe.title}
    </div>
  );
}
