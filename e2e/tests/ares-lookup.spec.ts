import { test, expect } from "@playwright/test";

/**
 * ARES (Czech business registry) lookup on Account.Název/IČO — searches as you type, click a
 * match to prefill (never auto-saves). See src/lib/ares.ts + src/components/AresCompanyLookup.tsx.
 */

test("typing a company name shows ARES matches; picking one prefills name/IČO/address/legal form", async ({
  page,
}) => {
  await page.goto("/accounts/new");
  await page.getByLabel(/^Název/i).fill("NAVERTICA");

  const match = page.getByText("NAVERTICA a.s.", { exact: true });
  await expect(match).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/IČO 25585207/)).toBeVisible();
  await match.click();

  await expect(page.getByLabel(/^Název/i)).toHaveValue("NAVERTICA a.s.");
  await expect(page.getByLabel(/^IČO/i)).toHaveValue("25585207");
  await expect(page.getByLabel(/^Ulice/i)).toHaveValue("Maříkova");
  await expect(page.getByLabel(/Číslo popisné/i)).toHaveValue(/2287/);
  await expect(page.getByRole("textbox", { name: "Obec" })).toHaveValue("Brno");
  await expect(page.getByLabel(/^PSČ/i)).toHaveValue("62100");
  await expect(page.getByLabel(/^Stát/i)).toHaveValue("Česká republika");
  await expect(page.getByLabel(/Právní forma/i)).toContainText("Akciová společnost");

  // still just a prefill — no navigation/save happened
  await expect(page).toHaveURL(/\/accounts\/new$/);
  await expect(page.getByRole("button", { name: "Vytvořit", exact: true })).toBeVisible();
});

test("typing an IČO shows the exact match and prefills the rest", async ({ page }) => {
  await page.goto("/accounts/new");
  await page.getByLabel(/^IČO/i).fill("06859101");

  await expect(page.getByText("ELSI CZ s.r.o.", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText("ELSI CZ s.r.o.", { exact: true }).click();

  await expect(page.getByLabel(/^Název/i)).toHaveValue("ELSI CZ s.r.o.");
  await expect(page.getByLabel(/^IČO/i)).toHaveValue("06859101");
});

test("picking a match from Název doesn't reopen the dropdown on IČO (regression)", async ({ page }) => {
  await page.goto("/accounts/new");
  await page.getByLabel(/^Název/i).fill("NAVERTICA");

  const match = page.getByText("NAVERTICA a.s.", { exact: true });
  await expect(match).toBeVisible({ timeout: 10_000 });
  await match.click();

  await expect(page.getByLabel(/^IČO/i)).toHaveValue("25585207");
  // give any stray effect on the IČO field a moment to (incorrectly) fire, then assert nothing opened
  await page.waitForTimeout(800);
  await expect(page.getByText(/Hledám v ARES/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /IČO 25585207/ })).toHaveCount(0);
});

test("does not pop up when opening an existing account with a name already filled in", async ({ page }) => {
  await page.goto("/accounts");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);

  // give any stray effect a moment, then assert no ARES popover is showing
  await page.waitForTimeout(1000);
  await expect(page.getByText(/Hledám v ARES/)).toHaveCount(0);
  await expect(page.locator("button", { hasText: "IČO " })).toHaveCount(0);
});
