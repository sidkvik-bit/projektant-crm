import { createClient } from "@/lib/supabase/server";
import { getOptionSetValues } from "@/engine/optionSets";
import { PageHeader } from "@/components/shell/PageHeader";
import { KanbanBoard, type KanbanCard, type KanbanColumn } from "./KanbanBoard";
import { moveProjectStage } from "./actions";

export default async function KanbanPage() {
  const supabase = await createClient();

  const [statusValues, projectsRes, milestonesRes] = await Promise.all([
    getOptionSetValues(supabase, "project_status_reason"),
    supabase
      .from("projects")
      .select("id, name, status_reason_id, accounts(name)")
      .eq("status", "active"),
    supabase
      .from("project_milestones")
      .select("project_id, name, termin_splneni")
      .eq("splneno", false)
      .not("termin_splneni", "is", null)
      .order("termin_splneni", { ascending: true }),
  ]);

  const columns: KanbanColumn[] = statusValues.map((v) => ({ id: v.id, label: v.label }));

  const nextMilestoneByProject = new Map<string, string>();
  for (const m of milestonesRes.data ?? []) {
    if (!nextMilestoneByProject.has(m.project_id)) {
      nextMilestoneByProject.set(m.project_id, `${m.name} (${m.termin_splneni})`);
    }
  }

  const cards: KanbanCard[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    accountName: (p.accounts as unknown as { name: string } | null)?.name ?? null,
    nextMilestone: nextMilestoneByProject.get(p.id) ?? null,
    statusReasonId: p.status_reason_id,
  }));

  return (
    <div>
      <PageHeader title="Kanban" description="Přetáhni projekt mezi fázemi." />
      <KanbanBoard columns={columns} initialCards={cards} onMove={moveProjectStage} />
    </div>
  );
}
