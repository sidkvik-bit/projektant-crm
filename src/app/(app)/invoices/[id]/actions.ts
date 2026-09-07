"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function basePath(invoiceId: string) {
  return `/invoices/${invoiceId}`;
}

export async function addInvoiceItem(
  invoiceId: string,
  name: string,
  quantity: number,
  unit: string,
  unitPrice: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_items")
    .insert({ invoice_id: invoiceId, name, quantity, unit: unit || "ks", unit_price: unitPrice });
  if (error) throw error;
  revalidatePath(basePath(invoiceId));
}

export async function updateInvoiceItem(
  invoiceId: string,
  itemId: string,
  name: string,
  quantity: number,
  unit: string,
  unitPrice: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_items")
    .update({ name, quantity, unit: unit || "ks", unit_price: unitPrice })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath(basePath(invoiceId));
}

export async function deleteInvoiceItem(invoiceId: string, itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_items").delete().eq("id", itemId);
  if (error) throw error;
  revalidatePath(basePath(invoiceId));
}

/** "Označit jako uhrazenou" / zpět — datum_uhrady se nastaví/zruší podle nové hodnoty. */
export async function setInvoicePaid(invoiceId: string, uhrazeno: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ uhrazeno, datum_uhrady: uhrazeno ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", invoiceId);
  if (error) throw error;
  revalidatePath(basePath(invoiceId));
}
