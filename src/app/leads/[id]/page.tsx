import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById } from "@/engine/Database";
import { getOptionSetValues } from "@/engine/optionSets";
import { FormEngine } from "@/engine/FormEngine";
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

  const [record, statusReasonValues] = await Promise.all([
    getRecordById<EntityFormValues & { name: string }>(supabase, entity.table, id).catch(() => null),
    getOptionSetValues(supabase, entity.statusReasonOptionSetKey),
  ]);

  if (!record) notFound();

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateLead(id, values);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">{record.name}</h1>
      <FormEngine
        entity={entity as EntityDefinition}
        form={formDef as FormDefinition}
        defaultValues={record}
        optionSetValues={{ [entity.statusReasonOptionSetKey]: statusReasonValues }}
        onSubmit={handleUpdate}
        submitLabel="Uložit změny"
      />
    </div>
  );
}
