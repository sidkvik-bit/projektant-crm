import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/currentUser";
import { PageHeader } from "@/components/shell/PageHeader";
import { AdminUserList, type AdminUserRow } from "./AdminUserList";
import { adminSetUserRole } from "../actions";

export default async function AdminUsersPage() {
  const context = await getCurrentUserContext();
  const admin = createAdminClient();

  const [usersRes, orgsRes] = await Promise.all([
    admin.from("users").select("user_id, first_name, last_name, email, role, organization_id, created_at"),
    admin.from("organizations").select("id, name"),
  ]);

  const orgNameById = new Map(
    ((orgsRes.data ?? []) as { id: string; name: string }[]).map((org) => [org.id, org.name] as const),
  );

  const users: AdminUserRow[] = (
    (usersRes.data ?? []) as {
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      role: string;
      organization_id: string;
      created_at: string;
    }[]
  )
    .map((user) => ({
      userId: user.user_id,
      name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "—",
      email: user.email,
      role: user.role,
      organizationName: orgNameById.get(user.organization_id) ?? "—",
      createdAt: user.created_at,
      isSelf: user.user_id === context?.userId,
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName) || a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Uživatelé a role"
        description={`Všichni uživatelé napříč organizacemi (${users.length}). Platform Superadmin má přístup do admin sekce; uvnitř organizace má zatím stejná práva jako Basic User.`}
      />
      <div className="p-6">
        <AdminUserList users={users} action={adminSetUserRole} />
      </div>
    </div>
  );
}
