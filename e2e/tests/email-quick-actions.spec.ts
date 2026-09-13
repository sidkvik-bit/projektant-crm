import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * "Nový e-mail" header shortcut on Account/Contact/Project — opens Gmail's real web compose
 * (mail.google.com/mail/?view=cm...), not a `mailto:` link, since the OS default mail app is
 * often not Gmail and the app has no email sending of its own. See src/components/SmartLinks.tsx.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("Account/Contact/Project each show a 'Nový e-mail' shortcut to the right address, opening Gmail compose", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (!org) throw new Error("E2E Test Org not found");

  const suffix = Date.now();
  const accountEmail = `e2e-account-${suffix}@example.cz`;
  const contactEmail = `e2e-contact-${suffix}@example.cz`;

  const { data: account } = await admin
    .from("accounts")
    .insert({ organization_id: org.id, name: `E2E Email Shortcut Account ${suffix}`, email: accountEmail })
    .select("id")
    .single();
  const { data: contact } = await admin
    .from("contacts")
    .insert({ organization_id: org.id, account_id: account!.id, first_name: "Email", last_name: `Shortcut ${suffix}`, email: contactEmail })
    .select("id")
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org.id, account_id: account!.id, primary_contact_id: contact!.id, name: `E2E Email Shortcut Project ${suffix}` })
    .select("id")
    .single();

  try {
    await page.goto(`/accounts/${account!.id}`);
    const accountLink = page.getByRole("button", { name: "Nový e-mail" });
    await expect(accountLink).toHaveAttribute("href", new RegExp(`mail\\.google\\.com/mail/\\?.*to=${encodeURIComponent(accountEmail)}`));
    await expect(accountLink).toHaveAttribute("target", "_blank");

    await page.goto(`/contacts/${contact!.id}`);
    await expect(page.getByRole("button", { name: "Nový e-mail" })).toHaveAttribute(
      "href",
      new RegExp(`mail\\.google\\.com/mail/\\?.*to=${encodeURIComponent(contactEmail)}`),
    );

    // Project has no email of its own — uses its primary contact's address. The shortcut lives
    // in PageHeader, outside the tabs, so it's visible without switching off the default tab.
    await page.goto(`/projects/${project!.id}`);
    await expect(page.getByRole("button", { name: "Nový e-mail" })).toHaveAttribute(
      "href",
      new RegExp(`mail\\.google\\.com/mail/\\?.*to=${encodeURIComponent(contactEmail)}`),
    );
  } finally {
    await admin.from("projects").delete().eq("id", project!.id);
    await admin.from("contacts").delete().eq("id", contact!.id);
    await admin.from("accounts").delete().eq("id", account!.id);
  }
});
