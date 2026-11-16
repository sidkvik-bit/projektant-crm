import { EntityFormPage } from "@/engine/EntityFormPage";
import type { EntityFormValues } from "@/engine/zodSchema";
import { loadCustomEntityPage } from "@/customization/customEntityPage";
import { createCustomRecord } from "../../actions";

export default async function NewCustomRecordPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity: name } = await params;
  const { entity, form } = await loadCustomEntityPage(name);

  async function handleCreate(values: EntityFormValues) {
    "use server";
    return createCustomRecord(name, values);
  }

  return (
    <EntityFormPage
      entity={entity}
      form={form}
      title={`Nový záznam — ${entity.displayName}`}
      onSubmit={handleCreate}
      submitLabel="Vytvořit"
    />
  );
}
