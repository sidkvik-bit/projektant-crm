import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/currentUser";
import { describeInvoiceGeneration } from "@/lib/invoiceConfirmation";
import { ConfirmInvoiceButton } from "./ConfirmInvoiceButton";

const money = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" });

/** Potvrzení faktury, kterou připravil AI asistent (MCP request_invoice_from_quote). */
export default async function ConfirmInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string; items?: string; v?: string }>;
}) {
  const { quote = "", items, v = "" } = await searchParams;
  const user = await getCurrentUserContext();
  if (!user) redirect("/login");
  const itemIds = items ? items.split(",").filter(Boolean) : null;
  const preview = await describeInvoiceGeneration(await createClient(), user.userId, quote, itemIds);

  return (
    <div>
      <PageHeader title="Vystavit fakturu" description="Fakturu připravil AI asistent. Vznikne až po tvém kliknutí." />
      <div className="max-w-2xl space-y-4 p-6 text-sm">
        {!preview.ok ? (
          <p className="rounded-lg border border-dashed p-4 text-muted-foreground">{preview.error}</p>
        ) : (
          <>
            {preview.value.code !== v && (
              <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                Nabídka se od přípravy změnila. Níže je její aktuální stav.
              </p>
            )}
            <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
              <p>
                Z nabídky <strong>{preview.value.quoteName}</strong> vznikne faktura s položkami:
              </p>
              <table className="w-full text-left">
                <tbody>
                  {preview.value.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="py-1.5">{item.name}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-1.5 text-right">{money.format(Number(item.line_total))}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="py-1.5" colSpan={2}>
                      Celkem bez DPH
                    </td>
                    <td className="py-1.5 text-right">{money.format(preview.value.total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-muted-foreground">Faktura dostane další číslo z řady. DPH a QR platba se doplní samy.</p>
            </div>
            <div className="flex gap-2">
              <ConfirmInvoiceButton quoteId={preview.value.quoteId} itemIds={preview.value.itemIds} code={preview.value.code} />
              <Button variant="outline" render={<Link href={`/quotes/${preview.value.quoteId}`} />}>
                Nevystavovat
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
