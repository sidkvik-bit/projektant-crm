import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Invoice/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Invoice/FormXml/main_form.json";
import { createInvoice } from "../actions";

export default async function NewInvoicePage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nová faktura"
      defaultValues={{ vat_rate: 21 }}
      onSubmit={createInvoice}
      submitLabel="Vytvořit fakturu"
    />
  );
}
