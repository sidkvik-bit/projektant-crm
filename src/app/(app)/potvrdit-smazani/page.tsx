import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/currentUser";
import { describeDeletion } from "@/lib/deleteConfirmation";
import { ConfirmDeletionButton } from "./ConfirmDeletionButton";

/** Potvrzení smazání, které připravil AI asistent (MCP request_delete). Smaže jen kliknutí člověka. */
export default async function ConfirmDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; id?: string; v?: string }>;
}) {
  const { entity = "", id = "", v = "" } = await searchParams;
  const user = await getCurrentUserContext();
  if (!user) redirect("/login");
  const preview = await describeDeletion(await createClient(), user.userId, entity, id);

  return (
    <div>
      <PageHeader title="Potvrdit smazání" description="Smazání připravil AI asistent. Smaže se až po tvém kliknutí." />
      <div className="max-w-xl space-y-4 p-6 text-sm">
        {!preview.ok ? (
          <p className="rounded-lg border border-dashed p-4 text-muted-foreground">{preview.error}</p>
        ) : (
          <>
            {preview.value.code !== v && (
              <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                Záznam se od přípravy změnil. Níže je jeho aktuální stav.
              </p>
            )}
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <p>
                Smaže se <strong>{preview.value.label}</strong> ({preview.value.entity}).
              </p>
              {preview.value.cascades.length > 0 && (
                <div>
                  <p className="text-muted-foreground">Spolu s ním zmizí:</p>
                  <ul className="list-disc pl-5">
                    {preview.value.cascades.map((c) => (
                      <li key={c.label}>
                        {c.label}: {c.count}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.value.touchesInvoices && (
                <p className="font-medium text-destructive">Smaže se i vystavená faktura (účetní doklad).</p>
              )}
              <p className="text-muted-foreground">Smazání nejde vrátit.</p>
            </div>
            <div className="flex gap-2">
              <ConfirmDeletionButton entity={preview.value.entity} id={preview.value.id} code={preview.value.code} />
              <Button variant="outline" render={<Link href={preview.value.basePath ?? "/dashboard"} />}>
                Nemazat
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
