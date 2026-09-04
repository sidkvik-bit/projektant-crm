import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Bug/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Bug/FormXml/main_form.json";
import { createBug } from "../actions";

export default async function NewBugPage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nahlásit chybu"
      onSubmit={createBug}
      submitLabel="Nahlásit"
    />
  );
}
