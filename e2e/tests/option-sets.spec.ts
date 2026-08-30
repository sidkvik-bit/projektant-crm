import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("option set admin: add a value, toggle it inactive, delete it", async ({ page }) => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  await admin.from("option_set_values").delete().eq("label", "E2E Test Zdroj");

  await page.goto("/settings/option-sets");
  await page.getByRole("link", { name: /Zdroj zájemce/i }).click();
  await expect(page.getByRole("heading", { name: /Zdroj zájemce/i })).toBeVisible();

  const valueLabel = "E2E Test Zdroj";
  await page.getByLabel(/Nová hodnota/i).fill(valueLabel);
  await page.getByRole("button", { name: /Přidat/i }).click();

  const row = page.locator("div.flex.items-center.justify-between", { hasText: valueLabel });
  await expect(row).toBeVisible();
  await expect(row.getByRole("checkbox")).toBeChecked();

  await row.getByRole("checkbox").click();
  await page.reload();
  const rowAfterReload = page.locator("div.flex.items-center.justify-between", { hasText: valueLabel });
  await expect(rowAfterReload.getByRole("checkbox")).not.toBeChecked();
  await expect(rowAfterReload.getByText(valueLabel)).toHaveClass(/text-muted-foreground/);

  await rowAfterReload.getByRole("button").click();
  await expect(page.getByText(valueLabel)).toHaveCount(0);
});
