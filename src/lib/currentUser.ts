import { createClient } from "@/lib/supabase/server";

/** Platform Superadmin je role NAD všemi organizacemi (přístup do /admin sekce) — uvnitř
 * konkrétní organizace má zatím stejná práva jako Basic User. */
export type UserRole = "Basic User" | "Platform Superadmin";

export const USER_ROLES: UserRole[] = ["Basic User", "Platform Superadmin"];

export interface CurrentUserContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  isSuperadmin: boolean;
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
  };
}
