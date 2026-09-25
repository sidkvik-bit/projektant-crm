import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Quote/FormXml/main_form.json";
import { createQuote } from "../actions";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nová nabídka"
      defaultValues={{ vat_rate: 21, project_id: params.project_id, contact_id: params.contact_id }}
      onSubmit={createQuote}
      submitLabel="Vytvořit nabídku"
    />
  );
}
