import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Project/FormXml/main_form.json";
import { createProject } from "../actions";

export default async function NewProjectPage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nový projekt"
      extraLookups={[
        { targetEntity: "Account", table: "accounts", labelFields: ["name"] },
        { targetEntity: "Contact", table: "contacts", labelFields: ["first_name", "last_name"] },
        { targetEntity: "ProjectTemplate", table: "project_templates", labelFields: ["name"] },
      ]}
      onSubmit={createProject}
      submitLabel="Vytvořit"
    />
  );
}
