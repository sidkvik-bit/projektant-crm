"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatPhasePrice } from "@/lib/quoteDocument";
import type { QuotePhase } from "@/lib/quotePhases";

interface PhaseTemplateOption {
  kod: string;
  nazev: string;
}

/**
 * Fáze nabídky (název, odrážky, cena) — jak je vidět v PDF. Přidávají se ze šablon
 * (Nastavení → Šablony fází) a pak se upravují jen tady; šablona zůstane beze změny.
 * Uložení jedné fáze při opuštění pole, ať se nic neztratí a PDF náhled je hned aktuální.
 */
export function QuotePhasesPanel({
  quoteId,
  phases,
  templates,
  onAddFromTemplates,
  onAddEmpty,
  onUpdate,
  onDelete,
  onMove,
}: {
  quoteId: string;
  phases: QuotePhase[];
  templates: PhaseTemplateOption[];
  onAddFromTemplates: (quoteId: string, codes: string[]) => Promise<void>;
  onAddEmpty: (quoteId: string) => Promise<void>;
  onUpdate: (quoteId: string, phaseId: string, values: { nazev: string; odrazky: string; cena: number }) => Promise<void>;
  onDelete: (quoteId: string, phaseId: string) => Promise<void>;
  onMove: (quoteId: string, phaseId: string, direction: -1 | 1) => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Změnu se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  }

  const total = phases.reduce((sum, p) => sum + p.cena, 0);
  const used = new Set(phases.map((p) => p.kod).filter(Boolean));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Přidat fázi:</span>
        {templates.map((t) => (
          <Button
            key={t.kod}
            variant={used.has(t.kod) ? "secondary" : "outline"}
            size="sm"
            title={t.nazev}
            disabled={busy}
            onClick={() => run(() => onAddFromTemplates(quoteId, [t.kod]))}
          >
            <Plus className="size-3.5" />
            {t.kod}
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => onAddEmpty(quoteId))}>
          <Plus className="size-3.5" />
          Prázdná fáze
        </Button>
        {templates.length === 0 && (
          <a href="/settings/quote-phases" className="text-sm underline">
            Založit šablony fází
          </a>
        )}
      </div>

      {phases.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nabídka zatím nemá žádnou fázi.</p>
      ) : (
        phases.map((phase, i) => (
          <PhaseEditor
            key={`${phase.id}-${phase.nazev}-${phase.cena}-${phase.odrazky.join("|")}`}
            index={i}
            phase={phase}
            isFirst={i === 0}
            isLast={i === phases.length - 1}
            busy={busy}
            onSave={(values) => run(() => onUpdate(quoteId, phase.id, values))}
            onDelete={() => run(() => onDelete(quoteId, phase.id))}
            onMove={(direction) => run(() => onMove(quoteId, phase.id, direction))}
          />
        ))
      )}

      {phases.length > 0 && (
        <p className="text-right text-sm text-muted-foreground">
          Součet fází: {formatPhasePrice(total)} (v PDF jen se zapnutým „Zobrazit součet“)
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function PhaseEditor({
  index,
  phase,
  isFirst,
  isLast,
  busy,
  onSave,
  onDelete,
  onMove,
}: {
  index: number;
  phase: QuotePhase;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onSave: (values: { nazev: string; odrazky: string; cena: number }) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [nazev, setNazev] = useState(phase.nazev);
  const [odrazky, setOdrazky] = useState(phase.odrazky.join("\n"));
  const [cena, setCena] = useState(String(phase.cena));

  const dirty = nazev !== phase.nazev || odrazky !== phase.odrazky.join("\n") || Number(cena) !== phase.cena;
  const save = () => dirty && onSave({ nazev, odrazky, cena: Number(cena) || 0 });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{index + 1}/</span>
        {phase.kod && <Badge variant="outline">{phase.kod}</Badge>}
        <Input aria-label="Název fáze" value={nazev} onChange={(e) => setNazev(e.target.value)} onBlur={save} />
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" title="Posunout nahoru" disabled={busy || isFirst} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Posunout dolů" disabled={busy || isLast} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Odebrat fázi" disabled={busy} onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Odrážky (jeden řádek = jedna odrážka)</Label>
        <Textarea rows={Math.max(3, phase.odrazky.length + 1)} value={odrazky} onChange={(e) => setOdrazky(e.target.value)} onBlur={save} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Label className="text-xs text-muted-foreground">Cena (Kč)</Label>
        <Input
          aria-label="Cena fáze"
          className="w-36 text-right"
          type="number"
          step={500}
          min={0}
          value={cena}
          onChange={(e) => setCena(e.target.value)}
          onBlur={save}
        />
      </div>
    </div>
  );
}
