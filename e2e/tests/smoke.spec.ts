import { test, expect, type Page } from "@playwright/test";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) errors.push(`http ${res.status()}: ${res.url()}`);
  });
  return errors;
}

const LIST_PAGES = [
  { path: "/dashboard", heading: /Můj den|Dashboard/i },
  { path: "/accounts", heading: /Obchodní vztah/i },
  { path: "/contacts", heading: /Kontakty/i },
  { path: "/leads", heading: /Zájemci/i },
  { path: "/projects", heading: /Projekty/i },
  { path: "/project-templates", heading: /Šablon/i },
  { path: "/activities", heading: /Aktivit/i },
  { path: "/kanban", heading: /Kanban/i },
  { path: "/settings/option-sets", heading: /Číselník/i },
  { path: "/settings/team", heading: /Tým/i },
];

for (const { path, heading } of LIST_PAGES) {
  test(`${path} loads without server/console errors`, async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.goto(path);
    expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    expect(errors, `errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("accounts list no longer says 'Firma' anywhere", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByText(/^Firma$|^Firmy$/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Obchodní vztahy/i })).toBeVisible();
});

test("can open an individual contact record from the grid", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/contacts");
  const firstRowLink = page.locator("table tbody tr a").first();
  await expect(firstRowLink).toBeVisible();
  const href = await firstRowLink.getAttribute("href");
  expect(href, "row link should point at a real record id, not /contacts/undefined").toMatch(
    /^\/contacts\/[0-9a-f-]{36}$/,
  );
  await firstRowLink.click();
  await expect(page.getByRole("button", { name: /Uložit změny/i })).toBeVisible();
  expect(errors, `errors opening contact:\n${errors.join("\n")}`).toEqual([]);
});

test("contact without an account (Eva Volná) opens fine and account field is optional", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/contacts");
  await page.getByRole("link", { name: "Eva" }).click();
  await expect(page.getByRole("button", { name: /Uložit změny/i })).toBeVisible();
  // required fields render an asterisk/marker next to the label in FormEngine — Obchodní vztah must not have one
  const accountLabel = page.getByText("Obchodní vztah", { exact: false }).first();
  await expect(accountLabel).toBeVisible();
  await expect(accountLabel).not.toContainText("*");
  expect(errors, `errors:\n${errors.join("\n")}`).toEqual([]);
});

test("can create a new contact with no account selected", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/contacts/new");
  await page.getByLabel(/Jméno/i).fill("Testovací");
  await page.getByLabel(/Příjmení/i).fill("Kontakt E2E");
  await page.getByRole("button", { name: /Vytvořit/i }).click();
  await page.waitForURL(/\/contacts(\/[0-9a-f-]{36})?$/, { timeout: 10_000 });
  expect(errors, `errors creating contact:\n${errors.join("\n")}`).toEqual([]);
});

test("notification bell renders without crashing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/dashboard");
  await page.locator("header button").first().click();
  await expect(page.getByText("Notifikace", { exact: true })).toBeVisible();
  expect(errors, `errors opening notifications:\n${errors.join("\n")}`).toEqual([]);
});

test("user menu in top bar opens without crashing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/dashboard");
  await page.locator("header button").nth(1).click();
  await expect(page.getByRole("menuitem", { name: /Odhlásit se/i })).toBeVisible();
  expect(errors, `errors opening user menu:\n${errors.join("\n")}`).toEqual([]);
});

const RECORD_LIST_PATHS = [
  { path: "/accounts", hasTabs: false },
  { path: "/contacts", hasTabs: false },
  { path: "/leads", hasTabs: false },
  { path: "/projects", hasTabs: true }, // tabbed detail page — form lives under the "Obecné" tab
  { path: "/project-templates", hasTabs: false },
  { path: "/activities", hasTabs: false },
];

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

for (const { path: listPath, hasTabs } of RECORD_LIST_PATHS) {
  test(`${listPath}: first record opens as a real editable detail page`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(listPath);
    const firstRowLink = page.locator("table tbody tr a").first();
    await expect(firstRowLink).toBeVisible();
    const href = await firstRowLink.getAttribute("href");
    expect(href, `row link on ${listPath} should point at a real record id`).toMatch(GUID_RE);

    await firstRowLink.click();

    // Project's detail page opens on its Milníky tab by default — the edit form
    // (and its "Uložit změny" button) only mounts once the Obecné tab is active.
    if (hasTabs) {
      await page.getByRole("tab", { name: /Obecné/i }).click();
    }

    await expect(page.getByRole("button", { name: /Uložit změny/i })).toBeVisible();

    // Regression: Select.Value must resolve lookup/optionset labels, not show raw ids.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText, `a raw GUID is visible on ${listPath} detail page — a lookup/optionset isn't resolving its label`).not.toMatch(GUID_RE);

    expect(errors, `errors opening record from ${listPath}:\n${errors.join("\n")}`).toEqual([]);
  });
}
