import Link from "next/link";
import { Flame, CalendarClock, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";

interface MilestoneRow {
  id: string;
  name: string;
  termin_splneni: string;
  project_id: string;
  projects: { name: string } | null;
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
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("project_milestones")
    .select("id, name, termin_splneni, project_id, projects(name)")
    .eq("owner_id", user?.id ?? "")
    .eq("splneno", false)
    .not("termin_splneni", "is", null)
    .order("termin_splneni", { ascending: true });

  const milestones = (data ?? []) as unknown as MilestoneRow[];
  const overdue = milestones.filter((m) => m.termin_splneni < today);
  const upcoming = milestones.filter((m) => m.termin_splneni >= today && m.termin_splneni <= in7DaysStr);

  return (
    <div>
      <PageHeader title="Můj den" description="Nesplněné milníky, kde jsi vlastník." />
      <div className="flex flex-col gap-6 p-6 md:flex-row">
        <Column icon={<Flame className="size-4 text-destructive" />} title="Hoří" count={overdue.length}>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nic po termínu. 🎉</p>
          ) : (
            overdue.map((m) => <MilestoneCard key={m.id} milestone={m} />)
          )}
        </Column>

        <Column icon={<CalendarClock className="size-4 text-primary" />} title="Dalších 7 dní" count={upcoming.length}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné blížící se termíny.</p>
          ) : (
            upcoming.map((m) => <MilestoneCard key={m.id} milestone={m} />)
          )}
        </Column>

        <Column icon={<Plus className="size-4 text-primary" />} title="Rychlé akce">
          <div className="flex flex-col gap-2">
            <Button variant="outline" render={<Link href="/leads/new">Nový zájemce</Link>} />
            <Button variant="outline" render={<Link href="/projects/new">Nový projekt</Link>} />
            <Button variant="outline" render={<Link href="/accounts/new">Nová firma</Link>} />
            <Button variant="outline" render={<Link href="/contacts/new">Nový kontakt</Link>} />
          </div>
        </Column>
      </div>
    </div>
  );
}
