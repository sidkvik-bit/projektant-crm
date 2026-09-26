import { EntityFormPage } from "@/engine/EntityFormPage";
import { createClient } from "@/lib/supabase/server";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Quote/FormXml/main_form.json";
import { createQuote } from "../actions";

/** Datum o N dní dopředu ve tvaru YYYY-MM-DD. */
function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Platnost se bere z nastavení firmy — projektant ji má pro všechny nabídky stejnou a nechce
  // ji vyplňovat pokaždé znovu. Přepsat ji na konkrétní nabídce samozřejmě jde.
  const { data: profile } = await supabase
    .from("users")
    .select("organizations(default_quote_validity_days)")
    .maybeSingle();
  const validityDays =
    (profile?.organizations as unknown as { default_quote_validity_days: number } | null)
      ?.default_quote_validity_days ?? 30;

  // Název se skládá z projektu a jeho parcel — "Cenová nabídka – RD Mikulášek (parc. č. 1247/3,
  // k. ú. Turnov)". Zůstává obyčejným polem, takže ho jde přepsat.
  let defaultName: string | undefined;
  if (params.project_id) {
    const [{ data: project }, { data: parcels }] = await Promise.all([
      supabase.from("projects").select("name").eq("id", params.project_id).maybeSingle(),
      supabase
        .from("project_parcels")
        .select("parcelni_cislo, katastralni_uzemi")
        .eq("project_id", params.project_id)
        .order("created_at"),
    ]);
    if (project?.name) {
      const numbers = (parcels ?? []).map((p) => p.parcelni_cislo).filter(Boolean);
      const area = (parcels ?? []).find((p) => p.katastralni_uzemi)?.katastralni_uzemi;
      const parcelPart = numbers.length
        ? ` (parc. č. ${numbers.join(", ")}${area ? `, k. ú. ${area}` : ""})`
        : "";
      defaultName = `Cenová nabídka – ${project.name}${parcelPart}`;
    }
  }

  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nová nabídka"
      defaultValues={{
        vat_rate: 21,
        project_id: params.project_id,
        contact_id: params.contact_id,
        name: defaultName,
        valid_until: inDays(validityDays),
      }}
      onSubmit={createQuote}
      submitLabel="Vytvořit nabídku"
    />
  );
}
