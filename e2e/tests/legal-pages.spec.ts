import { test, expect } from "@playwright/test";

/**
 * /Privacy and /Toc — Google OAuth consent screen links here (App domain settings), so they
 * must be publicly reachable without a login (see proxy.ts PUBLIC_PATHS) and stay at these
 * exact, already-registered-with-Google paths/casing.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("Privacy policy is public (no login redirect) and mentions the operator + email tracking", async ({ page }) => {
  const res = await page.goto("/Privacy");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/Privacy$/);
  await expect(page.getByRole("heading", { name: "Zásady ochrany osobních údajů" })).toBeVisible();
  await expect(page.getByText("04323980")).toBeVisible();
  await expect(page.getByText(/sledování e-mailů|sledování e/i).first()).toBeVisible();
});

test("Terms of service is public (no login redirect) and includes the processor clause", async ({ page }) => {
  const res = await page.goto("/Toc");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/Toc$/);
  await expect(page.getByRole("heading", { name: "Podmínky užití služby" })).toBeVisible();
  await expect(page.getByText(/zpracovatel/i).first()).toBeVisible();
});
