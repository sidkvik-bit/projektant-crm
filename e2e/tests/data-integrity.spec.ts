import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Core data-integrity rules that aren't about any one screen, but about whether the
 * underlying model actually behaves the way the rest of the app assumes it does.
 */

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function getTestOrgId(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (error) throw error;
  return data.id as string;
}

test("deleting an account detaches its contacts instead of deleting them (on delete set null, not cascade)", async () => {
  const admin = adminClient();
  const organizationId = await getTestOrgId(admin);

  const { data: account, error: accErr } = await admin
    .from("accounts")
    .insert({ organization_id: organizationId, name: `E2E Detach Test ${Date.now()}` })
    .select("id")
    .single();
  if (accErr) throw accErr;

  const { data: contact, error: contactErr } = await admin
    .from("contacts")
    .insert({ organization_id: organizationId, account_id: account.id, first_name: "Detach", last_name: "Test" })
    .select("id, account_id")
    .single();
  if (contactErr) throw contactErr;
  expect(contact.account_id).toBe(account.id);

  const { error: deleteErr } = await admin.from("accounts").delete().eq("id", account.id);
  if (deleteErr) throw deleteErr;

  const { data: survivingContact, error: refetchErr } = await admin
    .from("contacts")
    .select("id, account_id")
    .eq("id", contact.id)
    .single();
  if (refetchErr) throw refetchErr;

  expect(survivingContact, "contact must survive the account's deletion, not cascade-delete with it").toBeTruthy();
  expect(survivingContact.account_id, "the FK must be nulled out, not left dangling or preserved").toBeNull();

  await admin.from("contacts").delete().eq("id", contact.id);
});

test("deleting a project cascades to delete its milestones (no orphaned rows left behind)", async () => {
  const admin = adminClient();
  const organizationId = await getTestOrgId(admin);

  const { data: account, error: accErr } = await admin
    .from("accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .single();
  if (accErr) throw accErr;

  const { data: project, error: projErr } = await admin
    .from("projects")
    .insert({ organization_id: organizationId, account_id: account.id, name: `E2E Cascade Test ${Date.now()}` })
    .select("id")
    .single();
  if (projErr) throw projErr;

  const { data: milestone, error: msErr } = await admin
    .from("project_milestones")
    .insert({ organization_id: organizationId, project_id: project.id, name: "Cascade check milestone" })
    .select("id")
    .single();
  if (msErr) throw msErr;

  const { error: deleteErr } = await admin.from("projects").delete().eq("id", project.id);
  if (deleteErr) throw deleteErr;

  const { data: orphan } = await admin.from("project_milestones").select("id").eq("id", milestone.id).maybeSingle();
  expect(orphan, "milestone should have been cascade-deleted along with its project").toBeNull();
});

test("new records default to active status", async () => {
  const admin = adminClient();
  const organizationId = await getTestOrgId(admin);

  const { data: lead, error } = await admin
    .from("leads")
    .insert({ organization_id: organizationId, name: `E2E Default Status ${Date.now()}` })
    .select("id, status")
    .single();
  if (error) throw error;

  expect(lead.status).toBe("active");
  await admin.from("leads").delete().eq("id", lead.id);
});

test("submitting a bug report with no description is blocked with a friendly message, not saved", async ({ page }) => {
  await page.goto("/bugs/new");
  const name = `E2E Missing Description ${Date.now()}`;
  await page.getByLabel(/Název/i).fill(name);
  await page.getByRole("button", { name: "Nahlásit", exact: true }).click();

  await expect(page.getByText(/Popis problému je povinné pole|povinné pole/i)).toBeVisible();
  // must still be on the create form — the record was not created
  await expect(page).toHaveURL(/\/bugs\/new$/);

  await page.goto("/bugs?view=all_bugs");
  await expect(page.getByText(name)).toHaveCount(0);
});

test("deactivating a record via the form moves it from the Aktivní to the Neaktivní view", async ({ page }) => {
  await page.goto("/leads/new");
  const name = `E2E Deactivate Toggle ${Date.now()}`;
  await page.getByLabel(/Jméno/i).fill(name);
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Deaktivovat" }).click();
  await expect(page.getByRole("dialog", { name: "Deaktivovat záznam?" })).toBeVisible();
  await page.getByRole("button", { name: "Ano, deaktivovat" }).click();

  // Both the header badge and the form's own "Stav" field should now say "Neaktivní" — the
  // form re-syncs from the server after this action's router.refresh(), not just the badge.
  await expect(page.locator('[data-slot="badge"]', { hasText: "Neaktivní" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Stav *" })).toContainText("Neaktivní");
  await expect(page.getByRole("button", { name: "Aktivovat" })).toBeVisible();

  await page.goto("/leads");
  await expect(page.getByText(name)).toHaveCount(0);

  // "Neaktivní" lives behind the view switcher's overflow dropdown, not its own pill.
  await page.getByRole("button", { name: /^(Další|Neaktivní|Vše)$/ }).click();
  await page.getByRole("menuitem", { name: "Neaktivní", exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
});
