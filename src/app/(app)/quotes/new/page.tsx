import { EntityFormPage } from "@/engine/EntityFormPage";
import { createClient } from "@/lib/supabase/server";
import { getDocumentDefaults, lockVatRateUnlessPayer } from "@/lib/organizationBilling";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Quote/FormXml/main_form.json";
import { createQuote } from "../actions";
import { resolveSupplierProfile } from "@/lib/supplierProfiles";
import { addMonths, formatAddressLine, formatClientLine } from "@/lib/quoteDocument";
import { formatContactName } from "@/engine/contacts";

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
  const [{ defaultVatRate, jePlatceDph, quoteValidityDays }, supplier] = await Promise.all([
    getDocumentDefaults(supabase),
    resolveSupplierProfile(supabase, "quote", null),
  ]);

  // Název se skládá z projektu a jeho parcel — "Cenová nabídka – RD Mikulášek (parc. č. 1247/3,
  // k. ú. Turnov)". Zůstává obyčejným polem, takže ho jde přepsat.
  let defaultName: string | undefined;
  let nazevStavby: string | undefined;
  let zadavatel: string | undefined;
  if (params.contact_id) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("first_name, last_name, address_street, address_house_number, address_city, address_zip")
      .eq("id", params.contact_id)
      .maybeSingle();
    if (contact) {
      zadavatel = formatClientLine(formatContactName(contact), {
        street: contact.address_street,
        houseNumber: contact.address_house_number,
        city: contact.address_city,
        zip: contact.address_zip,
      });
    }
  }
  if (params.project_id) {
    const [{ data: project }, { data: parcels }] = await Promise.all([
      supabase
        .from("projects")
        .select("name, address_street, address_house_number, address_city, address_zip")
        .eq("id", params.project_id)
        .maybeSingle(),
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
      // Název stavby do nabídky je adresa stavby, ne název zakázky (ten bývá jako název složky).
      // Jen předvyplnění — doplní se „Stavební úpravy objektu …“ podle zakázky.
      const address = formatAddressLine({
        street: project.address_street,
        houseNumber: project.address_house_number,
        city: project.address_city,
      });
      nazevStavby = address || undefined;
    }
  }

  return (
    <EntityFormPage
      entity={lockVatRateUnlessPayer(entity as EntityDefinition, jePlatceDph)}
      form={formDef as FormDefinition}
      title="Nová nabídka"
      defaultValues={{
        vat_rate: defaultVatRate,
        project_id: params.project_id,
        contact_id: params.contact_id,
        name: defaultName,
        // Platnost a poznámky z profilu dodavatele (Nastavení → Profily dodavatele), jinak z Fakturace.
        valid_until: supplier ? addMonths(supplier.platnost_nabidky_mesice) : inDays(quoteValidityDays),
        supplier_profile_id: supplier?.id,
        poznamky: supplier?.vychozi_poznamky ?? undefined,
        nazev_stavby: nazevStavby,
        zadavatel_text: zadavatel,
      }}
      onSubmit={createQuote}
      submitLabel="Vytvořit nabídku"
    />
  );
}
