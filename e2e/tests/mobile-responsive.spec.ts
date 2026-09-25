import { test, expect } from "@playwright/test";

/**
 * Mobile/tablet layout — the persistent desktop Sidebar hides below `md` in favor of a
 * hamburger + Sheet drawer (MobileNav). Also guards a real bug this surfaced: RecordNavigator's
 * flyout used to be positioned with a hardcoded `left: 16rem` assuming the desktop sidebar is
 * always there — it would have floated off-screen once the sidebar started hiding on narrow
 * viewports. See src/components/shell/MobileNav.tsx, src/engine/RecordNavigator.tsx.
 */
test.use({ viewport: { width: 375, height: 812 } });

test("mobile viewport: sidebar hidden, hamburger drawer works, no horizontal overflow on list/form", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "Firmy" })).toBeVisible();

  const desktopNavLink = page.getByRole("link", { name: "Můj den" });
  await expect(desktopNavLink).toBeHidden();

  const hasHScrollList = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHScrollList).toBe(false);

  await page.getByRole("button", { name: "Otevřít navigaci" }).click();
  await expect(page.getByRole("link", { name: "Můj den" })).toBeVisible();

  await page.getByRole("link", { name: "Projekty" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name: "Můj den" })).toBeHidden();

  await page.goto("/accounts/new");
  const hasHScrollForm = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHScrollForm).toBe(false);
});

test("mobile viewport: RecordNavigator flyout stays on-screen without the hidden desktop sidebar", async ({ page }) => {
  await page.goto("/accounts");
  const firstRowLink = page.locator("table tbody tr a").first();
  await firstRowLink.click();

  await page.getByRole("button", { name: "Seznam záznamů" }).click();
  const flyoutTitle = page.getByRole("paragraph").filter({ hasText: "Firmy" });
  await expect(flyoutTitle).toBeVisible();

  // Regression: the flyout panel used to be hardcoded to start at left: 16rem (desktop sidebar
  // width) — on a 375px viewport that pushed most of it off-screen instead of flush to the left.
  const box = await flyoutTitle.boundingBox();
  expect(box?.x ?? 999).toBeLessThan(50);
});
