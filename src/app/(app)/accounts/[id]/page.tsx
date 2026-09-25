import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import { EmailLink } from "@/components/SmartLinks";
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
  //
  // Projekt už na firmu neodkazuje — klientem je kontakt, takže se k projektům jde přes ně. To je
  // dotaz typu "in", který listRecords neumí (Database.ts skládá jen rovnosti), proto se sahá na
  // Supabase napřímo. A protože projekty závisí na id kontaktů, nejdou ty dva dotazy paralelně.
  const contacts = await listRecords<{ id: string }>(supabase, "contacts", {
    select: "id",
    filter: { account_id: id },
  });
  const contactIds = contacts.map((c) => c.id);
  const projects = contactIds.length
    ? ((await supabase.from("projects").select("id").in("primary_contact_id", contactIds)).data ?? [])
    : [];
  const relatedActivities = [
    ...contacts.map((c) => ({ entityType: "Contact", entityId: c.id })),
    ...projects.map((p) => ({ entityType: "Project", entityId: p.id as string })),
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
      actions={<EmailLink email={record.email} label="Nový e-mail" />}
    />
  );
}
