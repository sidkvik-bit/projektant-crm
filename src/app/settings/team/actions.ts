"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function inviteMember(email: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášeno.");

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase.from("organization_invites").insert({
    organization_id: prefs?.organization_id,
    email,
  });
  if (error) throw error;

  revalidatePath("/settings/team");
}

export async function revokeInvite(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("organization_invites").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/settings/team");
}
