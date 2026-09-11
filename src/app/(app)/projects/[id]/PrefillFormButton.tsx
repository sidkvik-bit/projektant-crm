"use client";

import { useState } from "react";
import { ClipboardList, ExternalLink, Copy, Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  UTILITY_PROVIDERS,
  buildPrefillFields,
  buildPrefillSummary,
  type PrefillData,
  type UtilityProvider,
} from "@/lib/utilityPrefill";

/**
 * Žádný z portálů síťařů nejde reálně předvyplnit přes URL (login, GIS wizard, CAPTCHA) —
 * tlačítko proto portál jen otevře v nové záložce a vedle nabídne souhrn údajů z CRM
 * (žadatel, kontakt, místo zájmu) ke zkopírování do jejich formuláře.
 */
export function PrefillFormButton({ data }: { data: PrefillData }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UtilityProvider | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fields = buildPrefillFields(data);
  const summary = buildPrefillSummary(data);

  function pickProvider(provider: UtilityProvider) {
    // Explicit width/height forces a real separate popup window (not just another tab in
    // this window), so the CRM summary panel and the provider's form can sit side by side.
    const width = Math.min(1100, window.screen.availWidth - 100);
    const height = Math.min(900, window.screen.availHeight - 100);
    const left = window.screenX + 80;
    const top = window.screenY + 40;
    window.open(
      provider.url,
      "_blank",
      `noopener,noreferrer,width=${width},height=${height},left=${left},top=${top}`,
    );
    setSelected(provider);
    setCopied(false);
    setCopiedField(null);
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
  }

  async function copyField(field: { label: string; value: string }) {
    await navigator.clipboard.writeText(field.value);
    setCopiedField(field.label);
    setTimeout(() => setCopiedField((current) => (current === field.label ? null : current)), 1500);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelected(null);
      setCopied(false);
      setCopiedField(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ClipboardList className="size-4" />
            Předvyplnit formulář
          </Button>
        }
      />
      <DialogContent>
        {!selected ? (
          <>
            <DialogHeader>
              <DialogTitle>Vyžádat vyjádření k síti</DialogTitle>
              <DialogDescription>
                Vyber správce sítě — otevře se jeho formulář v nové záložce a vedle uvidíš údaje z CRM ke zkopírování.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5 py-2">
              {UTILITY_PROVIDERS.map((provider) => (
                <button
                  key={provider.key}
                  type="button"
                  onClick={() => pickProvider(provider)}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  {provider.label}
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{selected.label}</DialogTitle>
              <DialogDescription>
                Formulář se otevřel v nové záložce. Zkopíruj si údaje níž a vlož je do jednotlivých polí.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {fields.map((field) => (
                <button
                  key={field.label}
                  type="button"
                  disabled={!field.copyable}
                  onClick={() => copyField(field)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="block text-muted-foreground">{field.label}</span>
                    <span className="block truncate font-medium">{field.value}</span>
                  </span>
                  {copiedField === field.label ? (
                    <Check className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Copy className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <ChevronLeft className="size-4" />
                Jiný správce sítě
              </Button>
              <Button type="button" size="sm" onClick={copySummary}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Zkopírováno" : "Kopírovat vše"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
