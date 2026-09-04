"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function basePath(quoteId: string) {
  return `/quotes/${quoteId}`;
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
