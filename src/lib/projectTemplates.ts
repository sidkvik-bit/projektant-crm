import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMilestoneDueDates } from "@/engine/milestoneDates";

export interface AppliedTemplate {
  /** Kolik milníků přibylo. */
  added: number;
  /** Názvy milníků, které projekt už měl, a proto se znovu nevložily. */
  skipped: string[];
}

/**
 * Vloží milníky šablony (STU, DSP…) do projektu, termín = datum zahájení + offset_dni.
 *
 * Společné pro web (založení projektu, tlačítko „Vložit šablonu“) i MCP (create_project,
 * apply_project_template), ať se šablona chová všude stejně.
 *
 * Milník, který už projekt pod stejným názvem má, se přeskočí — opakované vložení téže
 * šablony tak nevyrobí duplicity. Projekt bez vybrané šablony si tuhle šablonu zapamatuje.
 * Chyby se nepolykají: když se milníky nevloží, volající to musí vědět.
 */
export async function applyProjectTemplate(
  supabase: SupabaseClient,
  input: { projectId: string; templateId: string; startDate: string | null },
): Promise<AppliedTemplate> {
  const [templateMilestones, existing, project] = await Promise.all([
    supabase
      .from("template_milestones")
      .select("name, offset_dni, description")
      .eq("template_id", input.templateId)
      .order("offset_dni"),
    supabase.from("project_milestones").select("name").eq("project_id", input.projectId),
    supabase.from("projects").select("project_template_id").eq("id", input.projectId).maybeSingle(),
  ]);
  if (templateMilestones.error) throw templateMilestones.error;
  if (existing.error) throw existing.error;
  if (project.error) throw project.error;
  if (!project.data) throw new Error("Projekt nenalezen (nebo k němu nemáš přístup).");

  const present = new Set((existing.data ?? []).map((m) => normalizeName(m.name)));
  const fresh = (templateMilestones.data ?? []).filter((m) => !present.has(normalizeName(m.name)));
  const skipped = (templateMilestones.data ?? [])
    .filter((m) => present.has(normalizeName(m.name)))
    .map((m) => m.name);

  if (fresh.length > 0) {
    const rows = computeMilestoneDueDates(fresh, input.startDate).map((m) => ({
      project_id: input.projectId,
      ...m,
    }));
    const { error } = await supabase.from("project_milestones").insert(rows);
    if (error) throw error;
  }

  if (!project.data.project_template_id) {
    const { error } = await supabase
      .from("projects")
      .update({ project_template_id: input.templateId })
      .eq("id", input.projectId);
    if (error) throw error;
  }

  return { added: fresh.length, skipped };
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}
