import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { loadStudio } from "@/customization/studio";
import { ChangeDiff } from "../_components/ChangeDiff";
import { ComponentActions } from "../_components/ComponentActions";
import { PublishPanel } from "../_components/PublishPanel";
import { StatusBadge } from "../_components/StatusBadge";

export default async function PublishPage() {
  const supabase = await createClient();
  const state = await loadStudio(supabase);
  const pending = state.components.filter((c) => c.status !== "published");

  return (
    <div>
      <PageHeader
        title="Publikovat změny"
        description="Co se po publikování změní pro všechny uživatele firmy. Před publikací si změny projdi v náhledu (Přehled → Náhled změn)."
      />
      <div className="max-w-5xl space-y-6 p-6">
        <PublishPanel pendingCount={pending.length} />
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Žádné rozpracované změny.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((c) => (
              <details key={`${c.type}/${c.entity}/${c.key}`} className="rounded-lg border bg-card p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{c.type}</span>
                  <code className="text-xs">
                    {c.entity}/{c.key}
                  </code>
                  <StatusBadge status={c.status} />
                  {c.error && <span className="text-xs text-destructive">neplatná: {c.error}</span>}
                  <span className="ml-auto">
                    <ComponentActions type={c.type} entity={c.entity} componentKey={c.key} status={c.status} label={c.key} />
                  </span>
                </summary>
                <div className="pt-3">
                  <ChangeDiff before={c.published} after={c.status === "deleted" ? null : c.draft} />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
