"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PluginError, runPlugins } from "@/customization/plugins";
import { loadCustomizations } from "@/customization/repository";
import { appendQuotePhases, moveQuotePhase, phasesFromTemplates } from "@/lib/quotePhases";
import { parseLines } from "@/lib/quoteDocument";

function basePath(quoteId: string) {
  return `/quotes/${quoteId}`;
}

/**
 * Založí Fakturu z Nabídky — zkopíruje projekt/odběratele/DPH/poznámku a vybrané položky.
 * Faktura pak žije nezávisle (editace v Nabídce se do už vygenerované Faktury nepropisují) —
 * jen `quote_id` drží odkaz zpátky pro dohledatelnost.
 *
 * `itemIds` jsou položky, které se opravdu dodaly: projektant naceňuje balíček dopředu a
 * fakturuje jen to, co z něj nakonec udělal. `undefined` znamená všechny.
 *
 * Hlavička i položky vznikají v jedné transakci (RPC `generate_invoice_from_quote`) — dřív
 * mohla po chybě při kopírování položek zůstat prázdná faktura se spotřebovaným číslem z řady.
 *
 * Vrací výsledek místo vyhození chyby: zprávu vyhozené chyby Next.js v produkci klientovi
 * nepředá, dialog by ukázal jen obecnou hlášku. Volá se z dialogu, který si navigaci řídí sám.
 */
export async function generateInvoiceFromQuote(
  quoteId: string,
  itemIds?: string[],
): Promise<GenerateInvoiceResult> {
  const supabase = await createClient();

  const { data: invoiceId, error } = await supabase.rpc("generate_invoice_from_quote", {
    p_quote_id: quoteId,
    p_item_ids: itemIds ?? null,
  });
  if (error) {
    console.error("generate_invoice_from_quote failed", { quoteId, error });
    // Vlastní hlášky z funkce (P0002) jsou psané pro uživatele, ostatní ne.
    return { error: error.code === "P0002" ? error.message : "Fakturu se nepodařilo vystavit." };
  }

  // Pluginy firmy (událost invoiceGenerated na entitě Invoice) — faktura už je vystavená, takže
  // chyba pluginu ji nevrátí; uživatel ji uvidí jako upozornění.
  let warning: string | undefined;
  try {
    await runPlugins(supabase, await loadCustomizations(supabase), {
      entity: "Invoice",
      event: "invoiceGenerated",
      recordId: invoiceId as string,
      input: { invoiceId, quoteId, itemIds: itemIds ?? null },
    });
  } catch (err) {
    if (!(err instanceof PluginError)) throw err;
    warning = `Faktura je vystavená, ale plugin ${err.plugin} skončil chybou: ${err.message}`;
  }

  revalidatePath(basePath(quoteId));
  return { invoiceId: invoiceId as string, warning };
}

export type GenerateInvoiceResult = { invoiceId: string; warning?: string } | { error: string };

export async function addQuoteItem(
  quoteId: string,
  name: string,
  quantity: number,
  unit: string,
  unitPrice: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_items")
    .insert({ quote_id: quoteId, name, quantity, unit: unit || "ks", unit_price: unitPrice });
  if (error) throw error;
  revalidatePath(basePath(quoteId));
}

export async function updateQuoteItem(
  quoteId: string,
  itemId: string,
  name: string,
  quantity: number,
  unit: string,
  unitPrice: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_items")
    .update({ name, quantity, unit: unit || "ks", unit_price: unitPrice })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(basePath(quoteId));
}

export async function deleteQuoteItem(quoteId: string, itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("quote_items").delete().eq("id", itemId);
  if (error) throw error;
  revalidatePath(basePath(quoteId));
}

// --- Fáze nabídky ---
//
// Fáze jsou kopie šablon (Nastavení → Šablony fází); úprava tady šablonu nemění.

export async function addQuotePhasesFromTemplates(quoteId: string, codes: string[]) {
  const supabase = await createClient();
  await appendQuotePhases(supabase, quoteId, await phasesFromTemplates(supabase, codes));
  revalidatePath(basePath(quoteId));
}

export async function addEmptyQuotePhase(quoteId: string) {
  const supabase = await createClient();
  await appendQuotePhases(supabase, quoteId, [{ nazev: "Nová fáze", odrazky: [], cena: 0 }]);
  revalidatePath(basePath(quoteId));
}

export async function updateQuotePhase(
  quoteId: string,
  phaseId: string,
  values: { nazev: string; odrazky: string; cena: number },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_phases")
    .update({
      nazev: values.nazev.trim() || "Fáze",
      odrazky: parseLines(values.odrazky),
      cena: Number.isFinite(values.cena) && values.cena >= 0 ? values.cena : 0,
    })
    .eq("id", phaseId)
    .eq("quote_id", quoteId);
  if (error) throw error;
  revalidatePath(basePath(quoteId));
}

export async function deleteQuotePhase(quoteId: string, phaseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("quote_phases").delete().eq("id", phaseId).eq("quote_id", quoteId);
  if (error) throw error;
  revalidatePath(basePath(quoteId));
}

export async function moveQuotePhaseAction(quoteId: string, phaseId: string, direction: -1 | 1) {
  const supabase = await createClient();
  await moveQuotePhase(supabase, quoteId, phaseId, direction);
  revalidatePath(basePath(quoteId));
}
