"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // scope: "local" — sign out only this device/session. The default ("global")
  // revokes every session for the user, which would log them out on all their
  // other devices too (this app is explicitly meant to be used from several).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
}
