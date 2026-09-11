"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractProfileFields } from "@/lib/googleProfile";

export async function joinOrganization(organizationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS na organization_invites vrátí řádek jen pokud pozvánka fakt patří
  // mému ověřenému e-mailu — klientem poslané organizationId samo o sobě nestačí.
  const { data: invite } = await supabase
    .from("organization_invites")
    .select("id, organization_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!invite) {
    throw new Error("Pozvánka k této organizaci nebyla nalezena.");
  }

  const { error: prefsError } = await supabase.from("users").insert({
    user_id: user.id,
    organization_id: invite.organization_id,
    ...extractProfileFields(user),
  });
  if (prefsError) throw prefsError;

  await supabase.from("organization_invites").delete().eq("id", invite.id);

  redirect("/leads");
}

export async function completeOnboarding(organizationName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: organizationName })
    .select()
    .single();
  if (orgError) throw orgError;

  const { error: prefsError } = await admin.from("users").insert({
    user_id: user.id,
    organization_id: org.id,
    ...extractProfileFields(user),
  });
  if (prefsError) throw prefsError;

  redirect("/leads");
}
