import { test, expect } from "@playwright/test";

test("Předvyplnit formulář: picking a provider opens it in a new tab and shows a copyable CRM summary", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Předvyplnit formulář" }).click();
  await expect(page.getByRole("heading", { name: "Vyžádat vyjádření k síti" })).toBeVisible();

  const providerButtons = page.locator('[role="dialog"] button', { hasText: /ČEZ|EG\.D|PREdistribuce|GasNet|GasD|NET4GAS|Pražská|CETIN|MAWIS/ });
  await expect(providerButtons).toHaveCount(9);

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "NET4GAS" }).click(),
  ]);
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  expect(popup.url()).toContain("net4gas.cz");

  await expect(page.getByRole("heading", { name: "NET4GAS" })).toBeVisible();
  await expect(page.locator('[role="dialog"]').getByText("Žadatel", { exact: true })).toBeVisible();
  await expect(page.locator('[role="dialog"]').getByText("IČO", { exact: true })).toBeVisible();
  await expect(page.locator('[role="dialog"]').getByText("Katastrální území", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kopírovat vše" })).toBeVisible();

  // each field is individually click-to-copy, no need to select text first
  const applicantRow = page.locator('[role="dialog"] button', { hasText: "Žadatel" });
  await applicantRow.click();
  const copiedApplicant = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedApplicant.length).toBeGreaterThan(0);
  expect(copiedApplicant).not.toContain("Žadatel"); // copies just the value, not the label

  await page.getByRole("button", { name: "Jiný správce sítě" }).click();
  await expect(page.getByRole("heading", { name: "Vyžádat vyjádření k síti" })).toBeVisible();
});
