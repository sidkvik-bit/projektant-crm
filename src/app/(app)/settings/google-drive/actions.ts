"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * organizations nemá klientskou UPDATE policy (viz init migrace) — záměrně, ať nejde
 * přepsat cokoliv o organizaci z prohlížeče. Tahle akce si proto nejdřív přes BĚŽNÉHO
 * (RLS-scoped) klienta ověří, jaká je organizace PŘIHLÁŠENÉHO uživatele, a teprve na TU
 * konkrétní řádku pustí admin klienta — ne na libovolné id poslané z formuláře.
 */
export async function updateDriveRootFolder(rootFolderUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášený uživatel.");

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new Error("Chybí uživatelský profil.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ drive_root_folder_url: rootFolderUrl || null })
    .eq("id", profile.organization_id);
  if (error) throw error;

  revalidatePath("/settings/google-drive");
}
