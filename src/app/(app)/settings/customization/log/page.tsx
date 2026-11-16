import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils";

interface LogRow {
  id: string;
  created_at: string;
  entity_name: string;
  key: string;
  event: string;
  level: "log" | "error";
  message: string;
  duration_ms: number | null;
}

/** Trace log pluginů (console.log a chyby) — D365 "Plugin Trace Log". */
export default async function CustomizationLogPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customization_logs")
    .select("id, created_at, entity_name, key, event, level, message, duration_ms")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const rows = (data ?? []) as LogRow[];

  return (
    <div>
      <PageHeader
        title="Log skriptů a pluginů"
        description="Posledních 300 záznamů z console.log a chyb serverových pluginů. Klientské skripty logují do konzole prohlížeče (F12)."
      />
      <div className="p-6">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Zatím prázdné.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Čas</th>
                  <th className="px-3 py-2">Plugin</th>
                  <th className="px-3 py-2">Událost</th>
                  <th className="px-3 py-2">Zpráva</th>
                  <th className="px-3 py-2 text-right">ms</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("cs-CZ")}
                    </td>
                    <td className="px-3 py-1.5">
                      <code className="text-xs">
                        {r.entity_name}/{r.key}
                      </code>
                    </td>
                    <td className="px-3 py-1.5 text-xs">{r.event}</td>
                    <td className={cn("px-3 py-1.5 font-mono text-xs", r.level === "error" && "text-destructive")}>
                      <span className="whitespace-pre-wrap">{r.message}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">{r.duration_ms ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
