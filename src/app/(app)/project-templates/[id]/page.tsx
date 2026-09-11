import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/FormXml/main_form.json";
import { updateProjectTemplate, addTemplateMilestone, deleteTemplateMilestone } from "../actions";
import { TemplateMilestonesPanel } from "./TemplateMilestonesPanel";

export default async function ProjectTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [record, milestones] = await Promise.all([
    getRecordById<EntityFormValues & { name: string }>(supabase, entity.table, id).catch(() => null),
    listRecords<{ id: string; name: string; offset_dni: number }>(supabase, "template_milestones", {
      select: "id, name, offset_dni",
      filter: { template_id: id },
    }),
  ]);

  if (!record) notFound();

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateProjectTemplate(id, values);
  }

  return (
    <div>
      <EntityFormPage
        entity={entity as EntityDefinition}
        form={formDef as FormDefinition}
        title={record.name}
        defaultValues={record}
        onSubmit={handleUpdate}
        submitLabel="Uložit změny"
      />
      <div className="mx-auto max-w-3xl px-6 pb-6">
        <TemplateMilestonesPanel
          templateId={id}
          milestones={milestones}
          onAdd={addTemplateMilestone}
          onDelete={deleteTemplateMilestone}
        />
      </div>
    </div>
  );
}
