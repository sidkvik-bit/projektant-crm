import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { buildStorageState } from "../lib/testAuth";

/**
 * "Přepnout firmu" v Nastavení — existující uživatel může přejít do jiné organizace, ke které
 * má pozvánku, nebo si rovnou založit novou (viz supabase/migrations/20260913240000_add_
 * organization_switching.sql). Mints its own throwaway user/org instead of touching the
 * shared e2e-tester identity — a switch mutates that user's organization_id for real, which
 * would corrupt every other spec relying on TEST_ORG_NAME if done on the shared session.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("switching organization via a pending invite moves the user, and unrelated orgs stay hidden", async ({ browser }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const email = `e2e-orgswitch-${suffix}@projektant-crm.test`;
  const password = "E2eOrgSwitch!Passw0rd";

  const { data: originOrg } = await admin.from("organizations").insert({ name: `E2E Origin Org ${suffix}` }).select("id").single();
  const { data: targetOrg } = await admin.from("organizations").insert({ name: `E2E Target Org ${suffix}` }).select("id").single();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr) throw createErr;
  const userId = created.user.id;

  await admin.from("users").insert({ user_id: userId, organization_id: originOrg!.id, email, first_name: "OrgSwitch" });
  await admin.from("organization_invites").insert({ organization_id: targetOrg!.id, email });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const storageState = await buildStorageState(url, anonKey, email, password);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    await page.goto("/settings/organization");
    await expect(page.getByText(`Momentálně pracuješ ve firmě "E2E Origin Org ${suffix}"`)).toBeVisible();
    await expect(page.getByText(`E2E Target Org ${suffix}`)).toBeVisible();

    await page.getByRole("button", { name: "Přepnout", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Ano, přepnout" }).click();

    await page.waitForURL(/\/dashboard/);
    await page.goto("/settings/organization");
    await expect(page.getByText(`Momentálně pracuješ ve firmě "E2E Target Org ${suffix}"`)).toBeVisible();

    // The consumed invite must be gone — no more "pending invites" to switch to.
    await expect(page.getByText("Zatím žádné — někdo tě musí nejdřív pozvat")).toBeVisible();
  } finally {
    await context.close();
    await admin.from("organization_invites").delete().eq("email", email);
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().in("id", [originOrg!.id, targetOrg!.id]);
  }
});

test("creating a new organization from settings switches the user into it", async ({ browser }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const email = `e2e-orgcreate-${suffix}@projektant-crm.test`;
  const password = "E2eOrgCreate!Passw0rd";
  const newOrgName = `E2E Created Org ${suffix}`;

  const { data: originOrg } = await admin.from("organizations").insert({ name: `E2E Origin Org ${suffix}` }).select("id").single();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr) throw createErr;
  const userId = created.user.id;
  await admin.from("users").insert({ user_id: userId, organization_id: originOrg!.id, email, first_name: "OrgCreate" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const storageState = await buildStorageState(url, anonKey, email, password);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  let newOrgId: string | undefined;
  try {
    await page.goto("/settings/organization");
    await page.getByLabel("Název firmy").fill(newOrgName);
    await page.getByRole("button", { name: "Založit a přepnout" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Ano, založit a přepnout" }).click();

    await page.waitForURL(/\/dashboard/);
    await page.goto("/settings/organization");
    await expect(page.getByText(`Momentálně pracuješ ve firmě "${newOrgName}"`)).toBeVisible();

    const { data: org } = await admin.from("organizations").select("id").eq("name", newOrgName).single();
    newOrgId = org?.id;
  } finally {
    await context.close();
    await admin.auth.admin.deleteUser(userId);
    const orgIds = [originOrg!.id, ...(newOrgId ? [newOrgId] : [])];
    await admin.from("organizations").delete().in("id", orgIds);
  }
});
