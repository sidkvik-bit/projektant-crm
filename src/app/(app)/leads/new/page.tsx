import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Lead/FormXml/main_form.json";
import { createLead } from "../actions";

export default async function NewLeadPage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nový zájemce"
      onSubmit={createLead}
      submitLabel="Vytvořit"
    />
  );
}
