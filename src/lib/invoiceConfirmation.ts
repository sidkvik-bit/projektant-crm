import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Vystavení faktury, které připraví AI (MCP request_invoice_from_quote), ale potvrdí jen člověk
// ve webu na /potvrdit-fakturu — vzniká účetní doklad s číslem z řady. Kód v odkazu váže
// potvrzení na stav nabídky a vybrané položky: když se mezitím změní, odkaz přestane platit.

export interface InvoicePreview {
  quoteId: string;
  quoteName: string;
  itemIds: string[] | null;
  items: { id: string; name: string; quantity: number; unit: string; unit_price: number; line_total: number }[];
  total: number;
  code: string;
}

export type InvoicePreviewResult = { ok: true; value: InvoicePreview } | { ok: false; error: string };

export async function describeInvoiceGeneration(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  itemIds?: string[] | null,
): Promise<InvoicePreviewResult> {
  const { data: quote } = await supabase.from("quotes").select("id, name, updated_at").eq("id", quoteId).maybeSingle();
  if (!quote) return { ok: false, error: "Nabídka neexistuje nebo k ní nemáš přístup." };

  // Faktura dostane VŽDY všechny fáze nabídky a k nim vybrané (jinak všechny) položky —
  // stejně jako RPC generate_invoice_from_quote.
  const [phasesResult, itemsResult] = await Promise.all([
    supabase.from("quote_phases").select("id, nazev, cena, updated_at").eq("quote_id", quoteId).order("sort_order"),
    supabase
      .from("quote_items")
      .select("id, name, quantity, unit, unit_price, line_total, updated_at")
      .eq("quote_id", quoteId)
      .order("sort_order"),
  ]);
  const error = phasesResult.error ?? itemsResult.error;
  if (error) return { ok: false, error: error.message };
  const phases = phasesResult.data ?? [];
  const allItems = itemsResult.data ?? [];

  const selected = itemIds?.length ? allItems.filter((i) => itemIds.includes(i.id)) : allItems;
  if (itemIds?.length && selected.length !== itemIds.length) {
    return { ok: false, error: "Některé vybrané položky k nabídce nepatří." };
  }
  if (phases.length === 0 && selected.length === 0) {
    return { ok: false, error: "Nabídka nemá žádné fáze ani položky — není co fakturovat." };
  }

  const ids = itemIds?.length ? [...itemIds].sort() : null;
  const code = createHash("sha256")
    .update(
      [quoteId, quote.updated_at, ...(ids ?? ["*"]), ...[...phases, ...selected].map((r) => r.updated_at), userId].join("|"),
    )
    .digest("hex")
    .slice(0, 12);

  const items = [
    ...phases.map((p) => ({ id: p.id, name: p.nazev, quantity: 1, unit: "fáze", unit_price: Number(p.cena), line_total: Number(p.cena) })),
    ...selected.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, line_total: i.line_total })),
  ];
  return {
    ok: true,
    value: {
      quoteId,
      quoteName: quote.name,
      itemIds: ids,
      items,
      total: items.reduce((sum, i) => sum + Number(i.line_total), 0),
      code,
    },
  };
}

export function invoiceConfirmUrl(origin: string, preview: InvoicePreview): string {
  const params = new URLSearchParams({ quote: preview.quoteId, v: preview.code });
  if (preview.itemIds) params.set("items", preview.itemIds.join(","));
  return `${origin}/potvrdit-fakturu?${params}`;
}
