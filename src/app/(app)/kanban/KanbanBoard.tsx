"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export interface KanbanColumn {
  id: string;
  label: string;
}

export interface KanbanCard {
  id: string;
  name: string;
  accountName: string | null;
  nextMilestone: string | null;
  statusReasonId: string | null;
}

function Card({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab space-y-1 rounded-lg border bg-card p-3 shadow-sm active:cursor-grabbing",
        isDragging && "z-10 opacity-70 shadow-md",
      )}
    >
      <Link
        href={`/projects/${card.id}`}
        className="text-sm font-medium hover:text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {card.name}
      </Link>
      {card.accountName && <p className="text-xs text-muted-foreground">{card.accountName}</p>}
      {card.nextMilestone && (
        <p className="text-xs text-muted-foreground">Nejbližší: {card.nextMilestone}</p>
      )}
    </div>
  );
}

function Column({
  column,
  cards,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 p-3 transition-colors",
        isOver && "border-primary/50 bg-accent/30",
      )}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {cards.length}
        </span>
      </div>
      <div className="flex-1 space-y-2">
        {cards.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  columns,
  initialCards,
  onMove,
}: {
  columns: KanbanColumn[];
  initialCards: KanbanCard[];
  onMove: (projectId: string, statusReasonId: string) => Promise<void>;
}) {
  const [cards, setCards] = useState(initialCards);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetColumnId = String(over.id);
    const cardId = String(active.id);

    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, statusReasonId: targetColumnId } : c)),
    );
    startTransition(() => onMove(cardId, targetColumnId));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-6">
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            cards={cards.filter((c) => c.statusReasonId === col.id)}
          />
        ))}
      </div>
    </DndContext>
  );
}
