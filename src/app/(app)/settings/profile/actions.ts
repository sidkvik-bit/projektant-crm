"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Změna vlastního jména. Dosud ho vyplnil ten, kdo uživatele pozval do týmu, a pak s ním nešlo
 * hnout — přitom se propisuje do vlastníka záznamů, notifikací i časové osy.
 *
 * Jde jen o jméno: organizaci a roli chrání trigger na users a měnit je smí jen jinými cestami
 * (přepnutí firmy, admin sekce).
 */
export async function updateOwnProfile(firstName: string, lastName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášený uživatel.");

  const { error } = await supabase
    .from("users")
    .update({ first_name: firstName.trim() || null, last_name: lastName.trim() || null })
    .eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
}
