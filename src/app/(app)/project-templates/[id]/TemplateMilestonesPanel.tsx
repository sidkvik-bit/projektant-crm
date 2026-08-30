"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Milestone {
  id: string;
  name: string;
  offset_dni: number;
}

export function TemplateMilestonesPanel({
  templateId,
  milestones,
  onAdd,
  onDelete,
}: {
  templateId: string;
  milestones: Milestone[];
  onAdd: (templateId: string, name: string, offsetDni: number) => Promise<void>;
  onDelete: (templateId: string, milestoneId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [offset, setOffset] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...milestones].sort((a, b) => a.offset_dni - b.offset_dni);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-medium">Kroky šablony</h3>

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím žádné kroky.</p>
        ) : (
          sorted.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="text-sm">
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-muted-foreground">+{m.offset_dni} dní</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(templateId, m.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onAdd(templateId, name, Number(offset) || 0);
            setName("");
            setOffset("0");
          } finally {
            setSubmitting(false);
          }
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="ms-name">Název kroku</Label>
          <Input id="ms-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="w-28 space-y-1.5">
          <Label htmlFor="ms-offset">Dní od startu</Label>
          <Input
            id="ms-offset"
            type="number"
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          <Plus className="size-4" />
          Přidat
        </Button>
      </form>
    </div>
  );
}
