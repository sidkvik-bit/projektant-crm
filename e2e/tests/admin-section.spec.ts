import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { buildStorageState } from "../lib/testAuth";

/**
 * /admin — přístupné jen roli Platform Superadmin (platformová role NAD všemi organizacemi,
 * viz supabase/migrations/20260913263000_rename_role_to_platform_superadmin.sql). Uvnitř
 * konkrétní organizace má superadmin zatím stejná práva jako Basic User.
 *
 * Role se v setupu nastavuje při INSERTu řádku do `users` — trigger, co chrání `role` před
 * změnou, je BEFORE UPDATE, takže insert s rolí projde, ale pozdější update by se tiše zahodil.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function createUserWithRole(role: string, prefix: string) {
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

  return { admin, userId: created.user.id, orgId: org!.id as string, suffix, storageState };
}

test("a Basic User is redirected away from /admin and sees no Admin nav group", async ({ browser }) => {
  const { admin, userId, orgId, storageState } = await createUserWithRole("Basic User", "basic");
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    await page.goto("/admin/organizations");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("link", { name: "Log změn" })).toHaveCount(0);
  } finally {
    await context.close();
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
});

test("a Platform Superadmin sees all organizations, the audit log, and can switch into another org", async ({ browser }) => {
  const { admin, userId, orgId, suffix, storageState } = await createUserWithRole("Platform Superadmin", "super");

  // Druhá, cizí organizace — superadmin ji musí vidět a umět se do ní přepnout bez pozvánky.
  const { data: otherOrg } = await admin
    .from("organizations")
    .insert({ name: `E2E Foreign Org ${suffix}` })
    .select("id")
    .single();

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    await page.goto("/admin/organizations");
    await expect(page.getByRole("heading", { name: "Organizace" })).toBeVisible();
    await expect(page.getByText(`E2E Foreign Org ${suffix}`)).toBeVisible();

    // Audit log je jinak (pro Basic Usera) přes RLS úplně neviditelný.
    await page.goto("/admin/audit-log");
    await expect(page.getByRole("heading", { name: "Log změn" })).toBeVisible();

    await page.goto("/admin/organizations");
    // bg-card má jen samotný řádek organizace, ne vnořené elementy — filtr podle názvu tak
    // vybere právě jeden řádek (na rozdíl od filtrování všech <div>, kde matchnou i rodiče).
    const foreignRow = page.locator("div.bg-card").filter({ hasText: `E2E Foreign Org ${suffix}` });
    await foreignRow.getByRole("button", { name: "Přepnout se sem" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Ano, přepnout" }).click();
    await page.waitForURL(/\/dashboard/);

    const { data: moved } = await admin.from("users").select("organization_id").eq("user_id", userId).single();
    expect(moved!.organization_id).toBe(otherOrg!.id);
  } finally {
    await context.close();
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().in("id", [orgId, otherOrg!.id]);
  }
});

test("role changes go through set_user_role and a plain update silently cannot change role", async () => {
  const admin = adminClient();
  const { userId, orgId } = await createUserWithRole("Basic User", "roleguard");

  try {
    // Přímý update (i service_role klientem) musí trigger tiše zahodit — role se nesmí změnit.
    await admin.from("users").update({ role: "Platform Superadmin" }).eq("user_id", userId);
    const { data: after } = await admin.from("users").select("role").eq("user_id", userId).single();
    expect(after!.role).toBe("Basic User");
  } finally {
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
});
