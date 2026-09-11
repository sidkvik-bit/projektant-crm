"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Milníky šablony</h3>
        <p className="text-xs text-muted-foreground">
          Při založení projektu z téhle šablony se zkopírují do projektu s termínem = datum zahájení + počet dní.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Název
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dní od startu
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                  Zatím žádné milníky.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((m) => (
                <TableRow key={m.id} className="transition-colors hover:bg-accent/40">
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">+{m.offset_dni} dní</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(templateId, m.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
