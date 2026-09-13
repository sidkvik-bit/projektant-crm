import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Project's "Historie a aktivity" tab rolls up activities from its Account and primary
 * Contact (D365-style, same mechanism Account already uses for its own Contacts/Projects —
 * see src/app/(app)/projects/[id]/page.tsx). Matters most for e-mails the email-sync feature
 * logs against the Account/Contact — those would otherwise never surface on the Project they
 * actually concern.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("Project timeline shows activities logged on its Account and primary Contact, not just its own", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (!org) throw new Error("E2E Test Org not found");

  const suffix = Date.now();
  const { data: account } = await admin
    .from("accounts")
    .insert({ organization_id: org.id, name: `E2E Rollup Account ${suffix}` })
    .select("id")
    .single();
  const { data: contact } = await admin
    .from("contacts")
    .insert({ organization_id: org.id, account_id: account!.id, first_name: "Rollup", last_name: `Kontakt ${suffix}` })
    .select("id")
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({
      organization_id: org.id,
      account_id: account!.id,
      primary_contact_id: contact!.id,
      name: `E2E Rollup Project ${suffix}`,
    })
    .select("id")
    .single();

  const accountActivitySubject = `E2E Account Activity ${suffix}`;
  const contactActivitySubject = `E2E Contact Activity ${suffix}`;
  await admin.from("activities").insert([
    { organization_id: org.id, entity_type: "Account", entity_id: account!.id, subject: accountActivitySubject },
    { organization_id: org.id, entity_type: "Contact", entity_id: contact!.id, subject: contactActivitySubject },
  ]);

  try {
    await page.goto(`/projects/${project!.id}`);
    await page.getByRole("tab", { name: /Historie a aktivity/i }).click();

    await expect(page.getByText(accountActivitySubject)).toBeVisible();
    await expect(page.getByText(contactActivitySubject)).toBeVisible();
  } finally {
    await admin.from("activities").delete().in("entity_id", [account!.id, contact!.id]);
    await admin.from("projects").delete().eq("id", project!.id);
    await admin.from("contacts").delete().eq("id", contact!.id);
    await admin.from("accounts").delete().eq("id", account!.id);
  }
});
