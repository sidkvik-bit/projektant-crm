import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Contact/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Contact/FormXml/main_form.json";
import { updateContact } from "../actions";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<
    EntityFormValues & { first_name: string; last_name: string | null; email: string | null }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateContact(id, values);
  }

  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title={[record.first_name, record.last_name].filter(Boolean).join(" ")}
      defaultValues={record}
      onSubmit={handleUpdate}
      submitLabel="Uložit změny"
      timeline={{ relatedEmail: record.email }}
    />
  );
}
