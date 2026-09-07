import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function createLead(admin: ReturnType<typeof adminClient>, fields: Record<string, unknown>) {
  const { data: org, error: orgErr } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (orgErr) throw orgErr;

  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .insert({ organization_id: org.id, ...fields })
    .select("id")
    .single();
  if (leadErr) throw leadErr;

  return { orgId: org.id as string, leadId: lead.id as string };
}

test("qualifying a lead as Account + Contact splits the name and links back", async ({ page }) => {
  const admin = adminClient();
  const { leadId } = await createLead(admin, {
    name: `Jan Novák ${Date.now()}`,
    company_name: `E2E Qualify Co ${Date.now()}`,
    email: "jan.novak@example.com",
    phone: "123456789",
    demand_description: "Poptávka po projekční dokumentaci",
  });

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Kvalifikovat: OV + Kontakt" }).click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  const accountId = page.url().split("/").pop()!;

  const { data: lead } = await admin
    .from("leads")
    .select("status, status_reason_id, converted_account_id, converted_contact_id, converted_project_id")
    .eq("id", leadId)
    .single();
  expect(lead!.status).toBe("inactive");
  expect(lead!.converted_account_id).toBe(accountId);
  expect(lead!.converted_project_id).toBeNull();

  const { data: reason } = await admin
    .from("option_set_values")
    .select("value_key")
    .eq("id", lead!.status_reason_id)
    .single();
  expect(reason!.value_key).toBe("kvalifikovan");

  const { data: contact } = await admin
    .from("contacts")
    .select("first_name, last_name, account_id, email, phone")
    .eq("id", lead!.converted_contact_id)
    .single();
  expect(contact!.first_name).toBe("Jan");
  expect(contact!.last_name).toMatch(/^Novák/);
  expect(contact!.account_id).toBe(accountId);
  expect(contact!.email).toBe("jan.novak@example.com");

  await expect(page.getByRole("heading", { name: /E2E Qualify Co/ })).toBeVisible();

  // re-visiting the lead now shows the "already qualified" link, not the qualify buttons
  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("button", { name: "Kvalifikovat: OV + Kontakt" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kvalifikovat: Projekt" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zobrazit výsledek kvalifikace" })).toHaveAttribute(
    "href",
    `/accounts/${accountId}`
  );

  // cleanup
  await admin.from("leads").delete().eq("id", leadId);
  await admin.from("contacts").delete().eq("id", lead!.converted_contact_id);
  await admin.from("accounts").delete().eq("id", accountId);
});

test("qualifying a lead as a Project creates Account + Contact underneath it", async ({ page }) => {
  const admin = adminClient();
  const { leadId } = await createLead(admin, {
    name: `Petra Svobodová ${Date.now()}`,
    company_name: `E2E Project Qualify Co ${Date.now()}`,
    email: "petra.svobodova@example.com",
    demand_description: "Návrh rodinného domu",
    expected_value: 250000,
  });

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Kvalifikovat: Projekt" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").pop()!;

  const { data: lead } = await admin
    .from("leads")
    .select("converted_account_id, converted_contact_id, converted_project_id")
    .eq("id", leadId)
    .single();
  expect(lead!.converted_project_id).toBe(projectId);

  const { data: project } = await admin
    .from("projects")
    .select("budget, description, account_id, primary_contact_id")
    .eq("id", projectId)
    .single();
  expect(Number(project!.budget)).toBe(250000);
  expect(project!.description).toBe("Návrh rodinného domu");
  expect(project!.account_id).toBe(lead!.converted_account_id);
  expect(project!.primary_contact_id).toBe(lead!.converted_contact_id);

  await expect(page.getByText(/E2E Project Qualify Co/)).toBeVisible();

  // cleanup
  await admin.from("leads").delete().eq("id", leadId);
  await admin.from("projects").delete().eq("id", projectId);
  await admin.from("contacts").delete().eq("id", lead!.converted_contact_id);
  await admin.from("accounts").delete().eq("id", lead!.converted_account_id);
});

test("a single-word lead name qualifies without a crash and leaves last_name null", async ({ page }) => {
  const admin = adminClient();
  const { leadId } = await createLead(admin, {
    name: `Prokop${Date.now()}`,
    phone: "601234567",
  });

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Kvalifikovat: OV + Kontakt" }).click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  const accountId = page.url().split("/").pop()!;

  const { data: lead } = await admin.from("leads").select("converted_contact_id").eq("id", leadId).single();
  const { data: contact } = await admin
    .from("contacts")
    .select("first_name, last_name")
    .eq("id", lead!.converted_contact_id)
    .single();
  expect(contact!.first_name).toMatch(/^Prokop/);
  expect(contact!.last_name).toBeNull();

  // cleanup
  await admin.from("leads").delete().eq("id", leadId);
  await admin.from("contacts").delete().eq("id", lead!.converted_contact_id);
  await admin.from("accounts").delete().eq("id", accountId);
});

test("qualifying a lead with no e-mail and no phone is blocked with an explanatory dialog", async ({ page }) => {
  const admin = adminClient();
  const { leadId } = await createLead(admin, {
    name: `E2E No Contact ${Date.now()}`,
  });

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Kvalifikovat: OV + Kontakt" }).click();

  await expect(page.getByRole("dialog", { name: "Kvalifikaci nejde dokončit" })).toBeVisible();
  await expect(page.getByText(/nemá vyplněný e-mail ani telefon/)).toBeVisible();
  await page.getByRole("button", { name: "Rozumím" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // genuinely blocked, not just a confusing dialog on top of a completed qualification
  const { data: lead } = await admin.from("leads").select("converted_account_id").eq("id", leadId).single();
  expect(lead!.converted_account_id).toBeNull();

  await admin.from("leads").delete().eq("id", leadId);
});
