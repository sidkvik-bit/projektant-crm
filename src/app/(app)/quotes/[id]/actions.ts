"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function basePath(quoteId: string) {
  return `/quotes/${quoteId}`;
}

/** Založí Fakturu z Nabídky — zkopíruje projekt/odběratele/kontakt/DPH/poznámku a všechny
 * položky. Faktura pak žije nezávisle (editace v Nabídce se do už vygenerované Faktury
 * nepropisují) — jen `quote_id` drží odkaz zpátky pro dohledatelnost. */
export async function generateInvoiceFromQuote(quoteId: string) {
  const supabase = await createClient();

  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .select("name, project_id, account_id, contact_id, vat_rate, note")
    .eq("id", quoteId)
    .single();
  if (quoteErr) throw quoteErr;

  const { data: items, error: itemsErr } = await supabase
    .from("quote_items")
    .select("name, quantity, unit, unit_price, sort_order")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (itemsErr) throw itemsErr;

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .insert({
      name: quote.name,
      quote_id: quoteId,
      project_id: quote.project_id,
      account_id: quote.account_id,
      contact_id: quote.contact_id,
      vat_rate: quote.vat_rate,
      note: quote.note,
    })
    .select("id")
    .single();
  if (invoiceErr) throw invoiceErr;

  if (items && items.length > 0) {
    const { error: copyErr } = await supabase.from("invoice_items").insert(
      items.map((item) => ({
        invoice_id: invoice.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        sort_order: item.sort_order,
      })),
    );
    if (copyErr) throw copyErr;
  }

  revalidatePath(basePath(quoteId));
  redirect(`/invoices/${invoice.id}`);
}

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
