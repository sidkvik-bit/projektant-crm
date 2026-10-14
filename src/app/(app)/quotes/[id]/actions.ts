"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  revalidatePath(basePath(quoteId));
  return { invoiceId: invoiceId as string };
}

export type GenerateInvoiceResult = { invoiceId: string } | { error: string };

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
