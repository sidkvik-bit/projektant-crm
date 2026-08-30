"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { error: prefsError } = await admin.from("user_preferences").insert({
    user_id: user.id,
    organization_id: org.id,
  });
  if (prefsError) throw prefsError;

  redirect("/leads");
}
