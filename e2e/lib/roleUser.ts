import { createClient } from "@supabase/supabase-js";
import { buildStorageState } from "./testAuth";

export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Uživatel s rolí ve vlastní, čerstvé organizaci (izolovaný od sdíleného E2E účtu).
 *
 * Role se nastavuje při INSERTu řádku do `users` — trigger, co chrání `role` před změnou, je
 * BEFORE UPDATE, takže insert s rolí projde, ale pozdější update by se tiše zahodil.
 */
export async function createUserWithRole(role: string, prefix: string) {
  const admin = adminClient();
  const suffix = Date.now();
  const email = `e2e-${prefix}-${suffix}@projektant-crm.test`;
  const password = "E2eAdminSection!Passw0rd";

  const { data: org } = await admin
    .from("organizations")
    .insert({ name: `E2E Admin Org ${prefix} ${suffix}` })
    .select("id")
    .single();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;

  await admin.from("users").insert({
    user_id: created.user.id,
    organization_id: org!.id,
    email,
    first_name: prefix,
    role,
  });

  const storageState = await buildStorageState(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    email,
    password,
  );

  const cleanup = async () => {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("organizations").delete().eq("id", org!.id);
  };

  return { admin, userId: created.user.id, orgId: org!.id as string, suffix, email, password, storageState, cleanup };
}
