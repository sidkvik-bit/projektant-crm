import Link from "next/link";
import { formatContactName } from "@/engine/contacts";
import { Flame, CalendarClock, MoonStar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { getOptionSetValues } from "@/engine/optionSets";
import { resolveStatusTone, STATUS_TONE_DOT_CLASS } from "@/engine/statusColor";
import { cn } from "@/lib/utils";

/** Projekt bez zalogované Aktivity tolikhle dní se počítá jako "bez pohybu" — proaktivně
 * upozorní na věci, co by jinak zapadly, ne jen na to, co má blížící se termín. */
const STALLED_DAYS = 14;

interface MilestoneRow {
  id: string;
  project_id: string;
  name: string;
  termin_splneni: string;
  projects: { name: string } | null;
}

function daysAgo(dateIso: string) {
  const diffMs = Date.now() - new Date(dateIso).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function MilestoneCard({ milestone }: { milestone: MilestoneRow }) {
  return (
    <Link
      href={`/projects/${milestone.project_id}`}
      className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <p className="text-sm font-medium">{milestone.name}</p>
      <p className="text-xs text-muted-foreground">{milestone.projects?.name ?? "—"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{milestone.termin_splneni}</p>
    </Link>
  );
}

function Column({
  icon,
  title,
  count,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">
        {count === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export default async function ProjectsOverviewPage() {
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toISOString().slice(0, 10);
  const stalledCutoff = new Date();
  stalledCutoff.setDate(stalledCutoff.getDate() - STALLED_DAYS);
  const stalledCutoffMs = stalledCutoff.getTime();

  const [stageValues, projectsRes, milestonesRes, activitiesRes] = await Promise.all([
    getOptionSetValues(supabase, "project_status_reason"),
    supabase
      .from("projects")
      .select("id, name, status_reason_id, created_at, contacts:contacts!projects_primary_contact_id_fkey(first_name, last_name)")
      .eq("status", "active"),
    supabase
      .from("project_milestones")
      .select("id, project_id, name, termin_splneni, projects(name)")
      .eq("splneno", false)
      .not("termin_splneni", "is", null)
      .order("termin_splneni", { ascending: true }),
    supabase
      .from("activities")
      .select("entity_id, activity_date")
      .eq("entity_type", "Project")
      .order("activity_date", { ascending: false }),
  ]);

  const projects = (projectsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    status_reason_id: string | null;
    created_at: string;
    contacts: { first_name: string | null; last_name: string | null } | null;
  }[];

  // Fáze projektu (D365 kanban vzor) — kolik aktivních projektů je právě kde v procesu.
  const stageLabelById = new Map(stageValues.map((v) => [v.id, v.label] as const));
  const stageCounts = new Map<string, number>();
  for (const p of projects) {
    const label = (p.status_reason_id && stageLabelById.get(p.status_reason_id)) || "Bez fáze";
    stageCounts.set(label, (stageCounts.get(label) ?? 0) + 1);
  }
  const stageBreakdown = stageValues
    .map((v) => ({ label: v.label, count: stageCounts.get(v.label) ?? 0 }))
    .filter((s) => s.count > 0);
  const noStageCount = stageCounts.get("Bez fáze") ?? 0;
  if (noStageCount > 0) stageBreakdown.push({ label: "Bez fáze", count: noStageCount });

  const milestones = (milestonesRes.data ?? []) as unknown as MilestoneRow[];
  const overdue = milestones.filter((m) => m.termin_splneni < today);
  const upcoming = milestones.filter((m) => m.termin_splneni >= today && m.termin_splneni <= in7DaysStr);

  // Poslední zalogovaná Aktivita na projekt — první výskyt vyhrává, řádky přišly seřazené sestupně.
  const lastActivityByProject = new Map<string, string>();
  for (const a of activitiesRes.data ?? []) {
    if (!lastActivityByProject.has(a.entity_id)) lastActivityByProject.set(a.entity_id, a.activity_date);
  }
  const stalledProjects = projects
    .filter((p) => {
      const last = lastActivityByProject.get(p.id) ?? p.created_at;
      return new Date(last).getTime() < stalledCutoffMs;
    })
    .sort(
      (a, b) =>
        new Date(lastActivityByProject.get(a.id) ?? a.created_at).getTime() -
        new Date(lastActivityByProject.get(b.id) ?? b.created_at).getTime(),
    );

  return (
    <div>
      <PageHeader title="Přehled projektů" description="Fáze, blížící se termíny a projekty bez pohybu — napříč celým týmem." />
      <div className="space-y-6 p-6">
        {stageBreakdown.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
            {stageBreakdown.map(({ label, count }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", STATUS_TONE_DOT_CLASS[label === "Bez fáze" ? "neutral" : resolveStatusTone(label)])} />
                {label} <span className="font-medium text-foreground">{count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-6 md:flex-row">
          <Column icon={<Flame className="size-4 text-destructive" />} title="Hoří" count={overdue.length} emptyLabel="Nic po termínu. 🎉">
            {overdue.map((m) => (
              <MilestoneCard key={m.id} milestone={m} />
            ))}
          </Column>

          <Column icon={<CalendarClock className="size-4 text-primary" />} title="Dalších 7 dní" count={upcoming.length} emptyLabel="Žádné blížící se termíny.">
            {upcoming.map((m) => (
              <MilestoneCard key={m.id} milestone={m} />
            ))}
          </Column>

          <Column
            icon={<MoonStar className="size-4 text-muted-foreground" />}
            title="Bez pohybu"
            count={stalledProjects.length}
            emptyLabel={`Všechny aktivní projekty měly pohyb za posledních ${STALLED_DAYS} dní.`}
          >
            {stalledProjects.map((p) => {
              const last = lastActivityByProject.get(p.id);
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{formatContactName(p.contacts)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {last ? `Naposledy aktivní ${daysAgo(last)} dní zpět` : "Zatím žádná aktivita"}
                  </p>
                </Link>
              );
            })}
          </Column>
        </div>
      </div>
    </div>
  );
}
