import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { OptionSetValuesPanel } from "./OptionSetValuesPanel";
import { addOptionSetValue, toggleOptionSetValueActive, deleteOptionSetValue } from "../actions";

export default async function OptionSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: optionSet } = await supabase
    .from("option_sets")
    .select("id, key, label")
    .eq("id", id)
    .maybeSingle();

  if (!optionSet) notFound();

  const { data: values } = await supabase
    .from("option_set_values")
    .select("id, label, sort_order, is_active")
    .eq("option_set_id", id);

  return (
    <div>
      <PageHeader title={optionSet.label} description={`Klíč: ${optionSet.key}`} />
      <div className="mx-auto max-w-2xl p-6">
        <OptionSetValuesPanel
          optionSetId={id}
          values={values ?? []}
          onAdd={addOptionSetValue}
          onToggleActive={toggleOptionSetValueActive}
          onDelete={deleteOptionSetValue}
        />
      </div>
    </div>
  );
}
