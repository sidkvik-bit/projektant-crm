"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhasePrice } from "@/lib/quoteDocument";
import {
  deletePhaseTemplate,
  insertDefaultPhaseTemplates,
  savePhaseTemplate,
  type PhaseTemplateInput,
} from "./actions";

export interface PhaseTemplate {
  id: string;
  kod: string;
  nazev: string;
  odrazky: string[];
  cena: number;
  sort_order: number;
}

const EMPTY: PhaseTemplateInput = { kod: "", nazev: "", odrazky: "", cena: 0 };

export function PhaseTemplatesClient({ templates }: { templates: PhaseTemplate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; values: PhaseTemplateInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: string }>, onDone?: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) return setError(result.error);
    onDone?.();
    router.refresh();
  }

  const set = <K extends keyof PhaseTemplateInput>(key: K, value: PhaseTemplateInput[K]) =>
    setEditing((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));

  return (
    <div className="space-y-4">
      {templates.length === 0 && (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">Zatím žádné šablony fází.</p>
          <Button variant="outline" onClick={() => run(insertDefaultPhaseTemplates)} disabled={busy}>
            <Wand2 className="size-4" />
            Vložit vzorové šablony PAS, STU, DSP
          </Button>
        </div>
      )}

      {templates.map((t) => (
        <div key={t.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{t.kod}</Badge>
              <span className="font-medium">{t.nazev}</span>
              <span className="text-sm text-muted-foreground">{formatPhasePrice(Number(t.cena))}</span>
            </div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {t.odrazky.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Upravit"
              onClick={() =>
                setEditing({ id: t.id, values: { kod: t.kod, nazev: t.nazev, odrazky: t.odrazky.join("\n"), cena: Number(t.cena) } })
              }
            >
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Smazat" onClick={() => run(() => deletePhaseTemplate(t.id))} disabled={busy}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button onClick={() => setEditing({ id: null, values: EMPTY })}>
        <Plus className="size-4" />
        Nová šablona fáze
      </Button>
      {error && !editing && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Upravit šablonu fáze" : "Nová šablona fáze"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-[8rem_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pt-kod">Zkratka</Label>
                  <Input id="pt-kod" value={editing.values.kod} placeholder="STU" onChange={(e) => set("kod", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pt-nazev">Název fáze</Label>
                  <Input id="pt-nazev" value={editing.values.nazev} onChange={(e) => set("nazev", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pt-odrazky">Odrážky (jeden řádek = jedna odrážka)</Label>
                <Textarea id="pt-odrazky" rows={7} value={editing.values.odrazky} onChange={(e) => set("odrazky", e.target.value)} />
              </div>
              <div className="w-48 space-y-1.5">
                <Label htmlFor="pt-cena">Cena (Kč)</Label>
                <Input
                  id="pt-cena"
                  type="number"
                  step={500}
                  min={0}
                  value={editing.values.cena}
                  onChange={(e) => set("cena", Number(e.target.value))}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button
              onClick={() => editing && run(() => savePhaseTemplate(editing.id, editing.values), () => setEditing(null))}
              disabled={busy}
            >
              {busy ? "Ukládám…" : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
