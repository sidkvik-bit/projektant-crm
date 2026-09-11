import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("app sidebar shows the CRM's own animated logo", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("aside .animated-logo__mark").first()).toBeVisible();
});

test("uploading an organization logo in Nastavení → Fakturace persists and doesn't break PDF generation", async ({
  page,
}) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();

  await page.goto("/settings/invoicing");
  await expect(page.getByRole("heading", { name: "Fakturace" })).toBeVisible();

  const logoPath = path.join(process.cwd(), "src", "assets", "images", "logo.png");
  await page.locator('input[type="file"]').setInputFiles(logoPath);
  await expect(page.getByRole("button", { name: "Odebrat obrázek" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByText("Uloženo.", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByRole("button", { name: "Odebrat obrázek" })).toBeVisible();

  // a quote generated with an org logo configured still renders a valid PDF
  const { data: account } = await admin.from("accounts").select("id").eq("organization_id", org!.id).limit(1).single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org!.id, account_id: account!.id, name: `E2E Branding Project ${Date.now()}` })
    .select("id")
    .single();
  const { data: quote } = await admin
    .from("quotes")
    .insert({ organization_id: org!.id, project_id: project!.id, account_id: account!.id, name: "E2E Branding Quote" })
    .select("id")
    .single();

  const pdf = await page.request.get(`/api/quotes/${quote!.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // cleanup
  await admin.from("projects").delete().eq("id", project!.id);
  await admin.from("organizations").update({ logo_url: null }).eq("id", org!.id);
});
