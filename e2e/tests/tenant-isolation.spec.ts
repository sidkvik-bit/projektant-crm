import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { buildStorageState } from "../lib/testAuth";

/**
 * The single most important invariant in a multi-tenant app: organization_id RLS must
 * actually isolate tenants, not just look right in the UI for the one seeded test org.
 * This spec creates a fully separate second organization + user (independent of the
 * shared global-setup session every other spec uses) and asserts data never crosses over,
 * in either direction, including via a guessed/typed-in direct URL.
 */

const ORG_B_NAME = "E2E Tenant Isolation Org B";
const USER_B_EMAIL = "e2e-tenant-b@projektant-crm.test";
const USER_B_PASSWORD = "E2eTenantB!Passw0rd2026";
const TENANT_B_ACCOUNT_NAME = "Tenant B Only Account — must never leak to Org A";

let tenantBStorageState: Awaited<ReturnType<typeof buildStorageState>>;
let tenantBAccountId: string;

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Chybí NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY v prostředí.");
  }

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let orgId: string;
  const { data: existingOrg } = await admin.from("organizations").select("id").eq("name", ORG_B_NAME).maybeSingle();
  if (existingOrg) {
    orgId = existingOrg.id as string;
  } else {
    const { data, error } = await admin.from("organizations").insert({ name: ORG_B_NAME }).select("id").single();
    if (error) throw error;
    orgId = data.id as string;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: USER_B_EMAIL,
    password: USER_B_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "E2E Tenant B" },
  });
  let userB = created?.user ?? null;
  if (createErr) {
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userB = data.users.find((u) => u.email === USER_B_EMAIL) ?? null;
      if (userB || data.users.length < 200) break;
      page += 1;
    }
  }
  if (!userB) throw new Error(`Nepodařilo se najít ani vytvořit tenant B uživatele: ${createErr?.message}`);

  await admin.from("users").upsert(
    { user_id: userB.id, organization_id: orgId, email: USER_B_EMAIL, first_name: "Tenant", last_name: "B" },
    { onConflict: "user_id" },
  );

  const { data: existingAccount } = await admin
    .from("accounts")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", TENANT_B_ACCOUNT_NAME)
    .maybeSingle();

  if (existingAccount) {
    tenantBAccountId = existingAccount.id as string;
  } else {
    const { data, error } = await admin
      .from("accounts")
      .insert({ organization_id: orgId, owner_id: userB.id, created_by: userB.id, name: TENANT_B_ACCOUNT_NAME })
      .select("id")
      .single();
    if (error) throw error;
    tenantBAccountId = data.id as string;
  }

  tenantBStorageState = await buildStorageState(url, anonKey, USER_B_EMAIL, USER_B_PASSWORD);
});

test("tenant B's grid shows only its own data — the default test org's seeded accounts never appear", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: tenantBStorageState });
  const page = await context.newPage();
  await page.goto("/accounts?view=all_accounts");

  await expect(page.getByText(TENANT_B_ACCOUNT_NAME)).toBeVisible();
  await expect(page.getByText("Novák Architekti s.r.o.")).toHaveCount(0);
  await expect(page.getByText("Stavební huť Praha")).toHaveCount(0);

  await context.close();
});

test("the default test org's grid never shows tenant B's data", async ({ page }) => {
  await page.goto("/accounts?view=all_accounts");
  await expect(page.getByText(TENANT_B_ACCOUNT_NAME)).toHaveCount(0);
});

test("opening another tenant's record by direct URL 404s instead of leaking its data", async ({ page }) => {
  const res = await page.goto(`/accounts/${tenantBAccountId}`);
  expect(res?.status(), "RLS should make this row invisible to the query, so the page must 404").toBe(404);
  await expect(page.getByText(TENANT_B_ACCOUNT_NAME)).toHaveCount(0);
});

test("global_search (fulltext RPC) respects tenant isolation in both directions", async ({ page, browser }) => {
  // The default test org must never find tenant B's account by searching its distinctive name.
  await page.goto("/dashboard");
  await page.getByPlaceholder(/Hledat v CRM/i).fill("must never leak");
  await expect(page.getByText(/Napiš aspoň|Nic nenalezeno/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(TENANT_B_ACCOUNT_NAME)).toHaveCount(0);

  // Tenant B's own search must find its own account by that same distinctive name.
  const context = await browser.newContext({ storageState: tenantBStorageState });
  const tenantBPage = await context.newPage();
  await tenantBPage.goto("/dashboard");
  await tenantBPage.getByPlaceholder(/Hledat v CRM/i).fill("must never leak");
  await expect(tenantBPage.getByText(TENANT_B_ACCOUNT_NAME)).toBeVisible({ timeout: 10_000 });

  // ...but must never find the default test org's seeded accounts either.
  await tenantBPage.getByPlaceholder(/Hledat v CRM/i).fill("Novák Architekti");
  await expect(tenantBPage.getByText(/Napiš aspoň|Nic nenalezeno/)).toBeVisible({ timeout: 10_000 });
  await expect(tenantBPage.getByText("Novák Architekti s.r.o.")).toHaveCount(0);

  await context.close();
});
