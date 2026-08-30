import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Activity/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Activity/FormXml/main_form.json";
import { updateActivity } from "../actions";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<EntityFormValues & { subject: string }>(
    supabase,
    entity.table,
    id,
  ).catch(() => null);

  if (!record) notFound();

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateActivity(id, values);
  }

  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title={record.subject}
      defaultValues={record}
      onSubmit={handleUpdate}
      submitLabel="Uložit změny"
    />
  );
}
