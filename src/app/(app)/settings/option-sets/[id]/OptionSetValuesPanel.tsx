"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface OptionValue {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export function OptionSetValuesPanel({
  optionSetId,
  values,
  onAdd,
  onToggleActive,
  onDelete,
}: {
  optionSetId: string;
  values: OptionValue[];
  onAdd: (optionSetId: string, label: string, sortOrder: number) => Promise<void>;
  onToggleActive: (optionSetId: string, valueId: string, isActive: boolean) => Promise<void>;
  onDelete: (optionSetId: string, valueId: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...values].sort((a, b) => a.sort_order - b.sort_order);
  const nextSortOrder = sorted.length > 0 ? Math.max(...sorted.map((v) => v.sort_order)) + 1 : 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {sorted.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={v.is_active}
                onCheckedChange={(checked) => onToggleActive(optionSetId, v.id, Boolean(checked))}
              />
              <span className={v.is_active ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {v.label}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                setError(null);
                try {
                  await onDelete(optionSetId, v.id);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Smazání se nezdařilo.");
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onAdd(optionSetId, label, nextSortOrder);
            setLabel("");
          } finally {
            setSubmitting(false);
          }
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="value-label">Nová hodnota</Label>
          <Input id="value-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </div>
        <Button type="submit" disabled={submitting}>
          <Plus className="size-4" />
          Přidat
        </Button>
      </form>
    </div>
  );
}
