import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/shell/PageHeader";
import { AuditLogTable, type AuditLogRow } from "./AuditLogTable";

const PAGE_SIZE = 100;

/** audit_logs plní SECURITY DEFINER trigger na každé tenant tabulce (insert/update/delete,
 * včetně kompletních starých i nových hodnot) — data tu byla odjakživa, jen je nikdo nikdy
 * nezobrazoval. Čte se přes admin klienta, protože jde o pohled NAPŘÍČ organizacemi. */
export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; action?: string }>;
}) {
  const params = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("audit_logs")
    .select("id, table_name, record_id, action, old_values, new_values, changed_by, organization_id, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (params.table) query = query.eq("table_name", params.table);
  if (params.action) query = query.eq("action", params.action);

  const [logsRes, usersRes, orgsRes] = await Promise.all([
    query,
    admin.from("users").select("user_id, first_name, last_name, email"),
    admin.from("organizations").select("id, name"),
  ]);

  const userNameById = new Map(
    (
      (usersRes.data ?? []) as { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[]
    ).map((u) => [u.user_id, [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "—"] as const),
  );
  const orgNameById = new Map(
    ((orgsRes.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name] as const),
  );

  const logs: AuditLogRow[] = (
    (logsRes.data ?? []) as {
      id: string;
      table_name: string;
      record_id: string | null;
      action: string;
      old_values: Record<string, unknown> | null;
      new_values: Record<string, unknown> | null;
      changed_by: string | null;
      organization_id: string | null;
      created_at: string;
    }[]
  ).map((log) => ({
    id: log.id,
    tableName: log.table_name,
    recordId: log.record_id,
    action: log.action,
    oldValues: log.old_values,
    newValues: log.new_values,
    changedBy: log.changed_by ? (userNameById.get(log.changed_by) ?? "—") : "systém",
    organizationName: log.organization_id ? (orgNameById.get(log.organization_id) ?? "—") : "—",
    createdAt: log.created_at,
  }));

  return (
    <div>
      <PageHeader
        title="Log změn"
        description={`Posledních ${PAGE_SIZE} změn napříč všemi organizacemi — kdo, kdy, co a s jakými hodnotami.`}
      />
      <div className="p-6">
        <AuditLogTable logs={logs} activeTable={params.table ?? null} activeAction={params.action ?? null} />
      </div>
    </div>
  );
}
