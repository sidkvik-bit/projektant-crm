"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/currentUser";
import { describeInvoiceGeneration } from "@/lib/invoiceConfirmation";
import { generateInvoiceFromQuote } from "../quotes/[id]/actions";

/** Vystaví fakturu stejnou cestou jako tlačítko na nabídce — po kontrole, že se nic nezměnilo. */
export async function confirmInvoice(quoteId: string, itemIds: string[] | null, code: string): Promise<{ error: string }> {
  const user = await getCurrentUserContext();
  if (!user) redirect("/login");
  const preview = await describeInvoiceGeneration(await createClient(), user.userId, quoteId, itemIds);
  if (!preview.ok) return { error: preview.error };
  if (preview.value.code !== code) return { error: "Nabídka se mezitím změnila. Zkontroluj přehled znovu a potvrď ho." };

  const result = await generateInvoiceFromQuote(quoteId, itemIds ?? undefined);
  if ("error" in result) return { error: result.error };
  redirect(`/invoices/${result.invoiceId}`);
}
