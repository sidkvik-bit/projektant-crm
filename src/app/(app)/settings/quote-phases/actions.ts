"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PHASE_TEMPLATES, parseLines } from "@/lib/quoteDocument";

const PATH = "/settings/quote-phases";

export interface PhaseTemplateInput {
  kod: string;
  nazev: string;
  /** Odrážky z textarea — jeden řádek = jedna odrážka. */
  odrazky: string;
  cena: number;
}

function toRow(input: PhaseTemplateInput) {
  return {
    kod: input.kod.trim().toUpperCase(),
    nazev: input.nazev.trim(),
    odrazky: parseLines(input.odrazky),
    cena: Number.isFinite(input.cena) && input.cena >= 0 ? input.cena : 0,
  };
}

export async function savePhaseTemplate(id: string | null, input: PhaseTemplateInput): Promise<{ error?: string }> {
  if (!input.kod.trim() || !input.nazev.trim()) return { error: "Vyplň zkratku a název fáze." };
  const supabase = await createClient();
  let error;
  if (id) {
    ({ error } = await supabase.from("quote_phase_templates").update(toRow(input)).eq("id", id));
  } else {
    const { count } = await supabase.from("quote_phase_templates").select("id", { count: "exact", head: true });
    ({ error } = await supabase.from("quote_phase_templates").insert({ ...toRow(input), sort_order: count ?? 0 }));
  }
  if (error) {
    console.error("savePhaseTemplate failed", error);
    return { error: "Šablonu se nepodařilo uložit." };
  }
  revalidatePath(PATH);
  return {};
}

/** Smaže jen šablonu — fáze už zkopírované do nabídek zůstanou, jak jsou. */
export async function deletePhaseTemplate(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("quote_phase_templates").delete().eq("id", id);
  if (error) {
    console.error("deletePhaseTemplate failed", error);
    return { error: "Šablonu se nepodařilo smazat." };
  }
  revalidatePath(PATH);
  return {};
}

/** Vloží vzorové šablony PAS, STU a DSP — nabízí se, když firma žádné nemá. */
export async function insertDefaultPhaseTemplates(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_phase_templates")
    .insert(DEFAULT_PHASE_TEMPLATES.map((t, i) => ({ ...t, sort_order: i })));
  if (error) {
    console.error("insertDefaultPhaseTemplates failed", error);
    return { error: "Vzorové šablony se nepodařilo vložit." };
  }
  revalidatePath(PATH);
  return {};
}
