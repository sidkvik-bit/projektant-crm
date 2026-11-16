import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatUserName } from "@/engine/users";
import { ChangeDiff } from "../_components/ChangeDiff";
import { RevertButton } from "../_components/RevertButton";

interface PublishRow {
  id: string;
  number: number;
  message: string;
  created_at: string;
  created_by: string | null;
  changes: { component_type: string; entity_name: string; key: string; before: unknown; after: unknown }[];
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: users }] = await Promise.all([
    supabase
      .from("customization_publishes")
      .select("id, number, message, created_at, created_by, changes")
      .order("number", { ascending: false })
      .limit(100),
    supabase.from("users").select("user_id, first_name, last_name, email"),
  ]);
  if (error) throw error;
  const publishes = (data ?? []) as PublishRow[];
  const author = (id: string | null) => formatUserName((users ?? []).find((u) => u.user_id === id) ?? null) || "—";

  return (
    <div>
      <PageHeader title="Historie publikací" description="Každá publikace s předchozím stavem — kteroukoli jde vrátit." />
      <div className="max-w-5xl space-y-3 p-6">
        {publishes.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Zatím nic publikováno.</p>
        )}
        {publishes.map((p) => (
          <details key={p.id} className="rounded-lg border bg-card p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">#{p.number}</span>
              <span>{p.message || "(bez popisu)"}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleString("cs-CZ")} · {author(p.created_by)} · {p.changes.length} změn
              </span>
              <span className="ml-auto">
                <RevertButton publishId={p.id} number={p.number} changeCount={p.changes.length} />
              </span>
            </summary>
            <div className="space-y-4 pt-3">
              {p.changes.map((c) => (
                <div key={`${c.component_type}/${c.entity_name}/${c.key}`} className="space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">{c.component_type}</span>{" "}
                    <code className="text-xs">
                      {c.entity_name}/{c.key}
                    </code>
                  </p>
                  <ChangeDiff before={c.before} after={c.after} />
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
