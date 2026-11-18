"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AppliedTemplate } from "@/lib/projectTemplates";

/**
 * „Vložit šablonu“ u milníků projektu. Šablona se dřív dala použít jen jednou, výběrem
 * při založení projektu — tady jde vložit kdykoli, i druhá (STU a pak DSP).
 */
export function ApplyTemplateDialog({
  projectId,
  templates,
  defaultStartDate,
  onApply,
}: {
  projectId: string;
  templates: { id: string; name: string }[];
  defaultStartDate: string | null;
  onApply: (projectId: string, templateId: string, startDate: string | null) => Promise<AppliedTemplate>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [startDate, setStartDate] = useState(defaultStartDate ?? new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labels = Object.fromEntries(templates.map((t) => [t.id, t.name]));

  async function handleApply() {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await onApply(projectId, templateId, startDate || null);
      router.refresh();
      if (result.skipped.length === 0) {
        setOpen(false);
      } else {
        setMessage(
          `Vloženo ${result.added} milníků. Přeskočeno (už v projektu jsou): ${result.skipped.join(", ")}.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Šablonu se nepodařilo vložit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMessage(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={templates.length === 0}>
            <ListPlus className="size-4" />
            Vložit šablonu
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vložit milníky ze šablony</DialogTitle>
          <DialogDescription>
            Termíny se dopočítají od data zahájení. Milníky, které projekt už má, se znovu nevloží.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="apply-template">Šablona</Label>
            <Select items={labels} value={templateId} onValueChange={(v) => setTemplateId((v as string) ?? "")}>
              <SelectTrigger id="apply-template" className="w-full">
                <SelectValue placeholder="Vyber šablonu" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apply-start">Datum zahájení</Label>
            <Input id="apply-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {message ? "Zavřít" : "Zrušit"}
          </Button>
          <Button onClick={handleApply} disabled={busy || !templateId}>
            {busy ? "Vkládám…" : "Vložit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
