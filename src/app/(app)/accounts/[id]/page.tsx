import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Account/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Account/FormXml/main_form.json";
import { updateAccount } from "../actions";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<EntityFormValues & { name: string; email: string | null }>(
    supabase,
    entity.table,
    id,
  ).catch(() => null);

  if (!record) notFound();

  // Historie a aktivity na Firmě zahrnuje i aktivity jejích Kontaktů a Projektů (rollup, D365 vzor).
  const [contacts, projects] = await Promise.all([
    listRecords<{ id: string }>(supabase, "contacts", { select: "id", filter: { account_id: id } }),
    listRecords<{ id: string }>(supabase, "projects", { select: "id", filter: { account_id: id } }),
  ]);
  const relatedActivities = [
    ...contacts.map((c) => ({ entityType: "Contact", entityId: c.id })),
    ...projects.map((p) => ({ entityType: "Project", entityId: p.id })),
  ];

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateAccount(id, values);
  }

  return (
    <EntityFormPage
      entity={entity as EntityDefinition}
      form={formDef as FormDefinition}
      title={record.name}
      defaultValues={record}
      onSubmit={handleUpdate}
      submitLabel="Uložit změny"
      timeline={{ related: relatedActivities, relatedEmail: record.email }}
    />
  );
}
