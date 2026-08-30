import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { GridEngine } from "@/engine/GridEngine";
import { Button } from "@/components/ui/button";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import view from "@/solutions/Projektant_CRM/Entities/Lead/SavedQueries/active_leads.json";

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(entity.table)
    .select("id, name, contact_info, status, expected_value, created_at, status_reason:option_set_values(label)")
    .order(view.defaultSort.field, { ascending: view.defaultSort.direction === "asc" });

  if (error) throw error;

  const rows = (data ?? []).map((row) => ({
    ...row,
    status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{entity.displayNamePlural}</h1>
        <Button render={<Link href="/leads/new">Nový zájemce</Link>} />
      </div>

      <GridEngine
        entity={entity as EntityDefinition}
        view={view as ViewDefinition}
        rows={rows}
        basePath="/leads"
      />
    </div>
  );
}
