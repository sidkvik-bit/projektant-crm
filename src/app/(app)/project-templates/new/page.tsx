import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/FormXml/main_form.json";
import { createProjectTemplate } from "../actions";

export default async function NewProjectTemplatePage() {
  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title="Nová šablona projektu"
      onSubmit={createProjectTemplate}
      submitLabel="Vytvořit"
    />
  );
}
