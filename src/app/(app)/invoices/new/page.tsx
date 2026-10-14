import { EntityFormPage } from "@/engine/EntityFormPage";
import { createClient } from "@/lib/supabase/server";
import { getDocumentDefaults, lockVatRateUnlessPayer } from "@/lib/organizationBilling";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Invoice/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Invoice/FormXml/main_form.json";
import { createInvoice } from "../actions";

export default async function NewInvoicePage() {
  // Sazba jde z nastavení firmy, ne natvrdo 21 % — neplátci DPH by se jinak předvyplňovala
  // pokaždé znovu.
  const { defaultVatRate, jePlatceDph } = await getDocumentDefaults(await createClient());

  return (
    <EntityFormPage
      entity={lockVatRateUnlessPayer(entity as EntityDefinition, jePlatceDph)}
      form={formDef as FormDefinition}
      title="Nová faktura"
      defaultValues={{ vat_rate: defaultVatRate }}
      onSubmit={createInvoice}
      submitLabel="Vytvořit fakturu"
    />
  );
}
