import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Contact/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Contact/FormXml/main_form.json";
import { createContact } from "../actions";

export default async function NewContactPage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nový kontakt"
      onSubmit={createContact}
      submitLabel="Vytvořit"
    />
  );
}
