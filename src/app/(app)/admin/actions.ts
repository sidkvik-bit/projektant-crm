"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Obě RPC funkce si samy ověří, že volající má roli System Administrator (security definer,
 * viz 20260913262000_scope_system_administrator_platform_wide.sql) — kontrola tedy nestojí
 * jen na tom, že se sem uživatel proklikal přes gatovaný /admin layout. */
export async function adminSwitchOrganization(organizationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_switch_organization", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  redirect("/dashboard");
}

export async function adminSetUserRole(userId: string, role: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error) throw error;
  revalidatePath("/admin/users");
}
