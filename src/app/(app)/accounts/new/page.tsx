import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Account/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Account/FormXml/main_form.json";
import { createAccount } from "../actions";

export default async function NewAccountPage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nová firma"
      onSubmit={createAccount}
      submitLabel="Vytvořit"
    />
  );
}
