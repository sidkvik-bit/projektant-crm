import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserOption {
  id: string;
  label: string;
}

interface UserLike {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export function formatUserName(user: UserLike | null | undefined): string {
  if (!user) return "—";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.email || "—";
}

export async function getOrgUserOptions(supabase: SupabaseClient): Promise<UserOption[]> {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, email")
    .order("first_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((u) => ({
    id: u.user_id as string,
    label: formatUserName(u as UserLike),
  }));
}
