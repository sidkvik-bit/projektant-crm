"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuoteItem } from "./QuoteItemsPanel";
import type { GenerateInvoiceResult } from "./actions";

const currencyFormat = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 2,
});

/**
 * Výběr položek při vystavení faktury z nabídky.
 *
 * Projektant nacení dopředu celý balíček a fakturuje jen to, co z něj nakonec udělal — dřív
 * dostal fakturu se všemi položkami a musel mazat řádek po řádku. Tady je odškrtne předem,
 * ve stejném kroku, v jakém fakturu zakládá.
 */
export function GenerateInvoiceDialog({
  quoteId,
  items,
  vatRate,
  onGenerate,
}: {
  quoteId: string;
  items: QuoteItem[];
  vatRate: number;
  onGenerate: (quoteId: string, itemIds?: string[]) => Promise<GenerateInvoiceResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    // Výchozí stav je "fakturuju všechno" — odškrtává se, co se nedodělalo.
    setSelected(new Set(items.map((i) => i.id)));
    setError(null);
    setOpen(true);
  }

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const subtotal = items
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + Number(i.line_total), 0);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    // Všechny vybrané = stejné chování jako dřív, proto se seznam ani neposílá.
    const allSelected = selected.size === items.length;
    const result = await onGenerate(quoteId, allSelected ? undefined : [...selected]).catch(
      (): GenerateInvoiceResult => ({ error: "Fakturu se nepodařilo vystavit." }),
    );
    if ("error" in result) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/invoices/${result.invoiceId}`);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <Receipt className="size-4" />
        Vygenerovat fakturu
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Co se bude fakturovat?</DialogTitle>
            <DialogDescription>
              Odškrtněte položky, které se nakonec nedělaly. Na faktuře se objeví jen ty zaškrtnuté.
            </DialogDescription>
          </DialogHeader>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nabídka nemá žádné položky — faktura vznikne prázdná a položky se do ní doplní ručně.
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40">
                  <Checkbox
                    id={`invoice-item-${item.id}`}
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                  />
                  <Label htmlFor={`invoice-item-${item.id}`} className="flex-1 cursor-pointer font-normal">
                    {item.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {item.quantity} {item.unit}
                    </span>
                  </Label>
                  <span className="text-sm tabular-nums">{currencyFormat.format(Number(item.line_total))}</span>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Vybráno {selected.size} z {items.length}
                {vatRate > 0 ? " (bez DPH)" : ""}
              </span>
              <span className="font-medium tabular-nums">{currencyFormat.format(subtotal)}</span>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Zrušit
            </Button>
            <Button onClick={handleGenerate} disabled={busy || (items.length > 0 && selected.size === 0)}>
              {busy ? "Vystavuji…" : "Vystavit fakturu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
