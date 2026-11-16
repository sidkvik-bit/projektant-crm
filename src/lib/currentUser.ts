import { createClient } from "@/lib/supabase/server";

import type { UserRole } from "./userRoles";

export { USER_ROLES, type UserRole } from "./userRoles";

export interface CurrentUserContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  isSuperadmin: boolean;
  /** Smí upravovat vrstvu úprav firmy — v DB to stejně vynucuje RLS (is_org_customizer). */
  isCustomizer: boolean;
}

/** `null` když není přihlášený, nebo přihlášený je, ale ještě neprošel onboardingem (chybí řádek v `users`). */
export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const role = profile.role as UserRole;
  return {
    userId: user.id,
    organizationId: profile.organization_id,
    role,
    isSuperadmin: role === "Platform Superadmin",
    isCustomizer: role === "System Customizer" || role === "Platform Superadmin",
  };
}
