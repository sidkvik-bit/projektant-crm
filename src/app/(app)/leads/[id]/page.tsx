import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Lead/FormXml/main_form.json";
import { updateLead } from "../actions";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<EntityFormValues & { name: string }>(
    supabase,
    entity.table,
    id,
  ).catch(() => null);

  if (!record) notFound();

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateLead(id, values);
  }

  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title={record.name}
      defaultValues={record}
      extraOptionSetKeys={["lead_source", "lead_rating"]}
      onSubmit={handleUpdate}
      submitLabel="Uložit změny"
    />
  );
}
