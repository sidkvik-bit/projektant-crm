"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addOptionSetValue(optionSetId: string, label: string, sortOrder: number) {
  const supabase = await createClient();
  const valueKey =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `hodnota_${Date.now()}`;

  const { error } = await supabase
    .from("option_set_values")
    .insert({ option_set_id: optionSetId, value_key: valueKey, label, sort_order: sortOrder });
  if (error) throw error;
  revalidatePath(`/settings/option-sets/${optionSetId}`);
}

export async function toggleOptionSetValueActive(optionSetId: string, valueId: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("option_set_values")
    .update({ is_active: isActive })
    .eq("id", valueId);
  if (error) throw error;
  revalidatePath(`/settings/option-sets/${optionSetId}`);
}

export async function deleteOptionSetValue(optionSetId: string, valueId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("option_set_values").delete().eq("id", valueId);
  if (error) throw new Error("Hodnota se nedá smazat — je použitá na existujících záznamech. Zkus ji deaktivovat.");
  revalidatePath(`/settings/option-sets/${optionSetId}`);
}
