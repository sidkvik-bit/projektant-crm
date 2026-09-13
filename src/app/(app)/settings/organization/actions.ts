"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Obě RPC funkce (switch_organization/create_and_switch_organization) jsou security definer a
 * samy si ověří oprávnění (pozvánka na ověřený e-mail volajícího) — viz migrace
 * 20260913240000_add_organization_switching.sql. Redirect na /dashboard vynutí čerstvé
 * server-side načtení všeho podle NOVÉ organizace (Server Components jinak nemají důvod se
 * samy překreslit jen kvůli změně organization_id na řádku uživatele). */
export async function switchOrganization(organizationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("switch_organization", { p_organization_id: organizationId });
  if (error) throw error;
  redirect("/dashboard");
}

export async function createAndSwitchOrganization(organizationName: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_and_switch_organization", { p_name: organizationName });
  if (error) throw error;
  redirect("/dashboard");
}
