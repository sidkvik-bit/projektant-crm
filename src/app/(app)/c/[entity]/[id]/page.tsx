import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRecordById } from "@/engine/Database";
import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityFormValues } from "@/engine/zodSchema";
import { CUSTOM_RECORDS_TABLE } from "@/customization/merge";
import { loadCustomEntityPage } from "@/customization/customEntityPage";
import { updateCustomRecord } from "../../actions";

export default async function CustomRecordPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity: name, id } = await params;
  const { entity, form } = await loadCustomEntityPage(name);
  const supabase = await createClient();

  const record = await getRecordById<EntityFormValues & { name: string; entity_name: string }>(
    supabase,
    CUSTOM_RECORDS_TABLE,
    id,
  ).catch(() => null);
  // Záznam jiné vlastní entity pod cizí adresou nevydávat — sdílí stejnou tabulku.
  if (!record || record.entity_name !== name) notFound();

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    return updateCustomRecord(name, id, values);
  }

  return (
    <EntityFormPage
      entity={entity}
      form={form}
      title={record.name}
      defaultValues={record}
      onSubmit={handleUpdate}
      submitLabel="Uložit změny"
      timeline={{}}
    />
  );
}
