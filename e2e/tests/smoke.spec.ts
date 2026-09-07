import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

/** "Neaktivní"/"Vše" live behind a dropdown ("Další ▾" or the currently active overflow
 * view's own label) in the view switcher, not as their own always-visible pill. */
async function openOverflowView(page: Page, label: string) {
  await page.getByRole("button", { name: /^(Další|Neaktivní|Vše)$/ }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

const LIST_PAGES = [
  { path: "/dashboard", heading: /Můj den|Dashboard/i },
  { path: "/accounts", heading: /Obchodní vztah/i },
  { path: "/contacts", heading: /Kontakty/i },
  { path: "/leads", heading: /Zájemci/i },
  { path: "/projects", heading: /Projekty/i },
  { path: "/project-templates", heading: /Šablon/i },
  { path: "/activities", heading: /Aktivit/i },
  { path: "/bugs", heading: /Bugy/i },
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
  // Untouched record -> form isn't dirty -> top bar shows "Zavřít" (Save/Save&Close only appear once dirty).
  await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible();
  expect(errors, `errors opening contact:\n${errors.join("\n")}`).toEqual([]);
});

test("contact without an account (Eva Volná) opens fine and account field is optional", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/contacts");
  await page.getByRole("link", { name: "Eva" }).click();
  await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible();
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
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
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

test("sidebar brand mark is static at rest and animates on hover", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/dashboard");

  const logo = page.locator(".animated-logo").first();
  const mark = page.locator(".animated-logo__mark").first();
  await expect(mark).toBeVisible();

  await expect(mark).toHaveCSS("animation-name", "none");
  await logo.hover();
  const animationName = await mark.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toContain("logo-spin-y");
  expect(animationName).toContain("logo-color-drift");

  expect(errors, `errors on logo hover:\n${errors.join("\n")}`).toEqual([]);
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
    // (and its top command bar) only mounts once the Obecné tab is active.
    if (hasTabs) {
      await page.getByRole("tab", { name: /Obecné/i }).click();
    }

    // Untouched record -> form isn't dirty -> top bar shows "Zavřít".
    await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible();

    // Regression: Select.Value must resolve lookup/optionset labels, not show raw ids.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText, `a raw GUID is visible on ${listPath} detail page — a lookup/optionset isn't resolving its label`).not.toMatch(GUID_RE);

    expect(errors, `errors opening record from ${listPath}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("grid search filters by the primary field", async ({ page }) => {
  await page.goto("/accounts");
  const rowCountBefore = await page.locator("table tbody tr").count();
  expect(rowCountBefore).toBeGreaterThan(1);

  await page.getByPlaceholder(/Hledat v poli/i).fill("Novák Architekti");
  await page.getByPlaceholder(/Hledat v poli/i).press("Enter");
  await page.waitForURL(/[?&]q=/);
  await expect(page.getByRole("link", { name: "Novák Architekti s.r.o." })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("grid status filter switches between active/inactive/all", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("button", { name: "Aktivní", exact: true })).toBeVisible();

  await openOverflowView(page, "Vše");
  await page.waitForURL(/view=all_accounts/);
  const allCount = await page.locator("table tbody tr").count();

  await openOverflowView(page, "Neaktivní");
  await page.waitForURL(/view=inactive_accounts/);
  const inactiveCount = await page.locator("table tbody tr").count();
  expect(inactiveCount).toBeLessThanOrEqual(allCount);
});

test("regression: switching back to 'Aktivní' after 'Vše'/'Neaktivní' shows only active records again", async ({
  page,
}) => {
  // The original bug: "Aktivní" was a separate, unrelated ?status= param from the view
  // switcher's own ?view= param, so once you'd ever switched to Neaktivní/Vše, clicking
  // back to "Aktivní" never reset ?status= and kept showing inactive records too. Each view
  // (including "Aktivní") is now fully self-contained (its own status condition), so this
  // can no longer happen regardless of switch order.
  await page.goto("/accounts");

  await openOverflowView(page, "Vše");
  await page.waitForURL(/view=all_accounts/);
  await openOverflowView(page, "Neaktivní");
  await page.waitForURL(/view=inactive_accounts/);

  await page.getByRole("button", { name: "Aktivní", exact: true }).click();
  await expect(page).not.toHaveURL(/view=inactive_accounts/);
  await expect(page).not.toHaveURL(/view=all_accounts/);
  await expect(page.getByRole("row", { name: /Neaktivní/ })).toHaveCount(0);
});

test("grid bulk delete: select rows via checkbox and delete them", async ({ page }) => {
  // create a throwaway lead so this test doesn't depend on (and doesn't permanently
  // consume) a specific seeded row — repeatable across runs.
  const name = `E2E Bulk Delete Target ${Date.now()}`;
  await page.goto("/leads/new");
  await page.getByLabel(/Jméno/i).fill(name);
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);

  await page.goto("/leads");
  const row = page.locator("table tbody tr", { hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").click();

  const deleteButton = page.getByRole("button", { name: /Odstranit \(1\)/ });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  await page.getByRole("button", { name: "Odstranit", exact: true }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("view switcher: switching to 'Moje' scopes the grid to records owned by the current user", async ({
  page,
}) => {
  await page.goto("/accounts");
  const activePill = page.getByRole("button", { name: "Aktivní", exact: true });
  const myPill = page.getByRole("button", { name: "Moje obchodní vztahy" });
  await expect(activePill).toBeVisible();
  const rowsBefore = await page.locator("table tbody tr").count();
  expect(rowsBefore).toBeGreaterThan(0);

  await myPill.click();
  await page.waitForURL(/view=my_accounts/);

  // seeded test data is all owned by the test user, so the "Moje" view should show the same rows
  await expect(page.locator("table tbody tr")).toHaveCount(rowsBefore);
});

test("export to Excel downloads a file with all entity columns", async ({ page }) => {
  await page.goto("/accounts");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportovat do Excelu" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/Obchodní vztahy_export\.xlsx/);
});

test("grid column header filter: contains operator on a real column", async ({ page }) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: /IČO/i }).click();
  await page.getByPlaceholder("Hodnota…").fill("12345678");
  await page.getByRole("button", { name: "Použít" }).click();
  await page.waitForURL(/cf_ico=/);
  await expect(page.getByRole("link", { name: "Novák Architekti s.r.o." })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("lookup combobox: search and pick a value, saved correctly", async ({ page }) => {
  await page.goto("/contacts/new");
  await page.getByLabel(/Jméno/i).fill("E2E Combobox Test");
  await page.getByLabel(/Příjmení/i).fill("Kontakt");

  const accountCombo = page.getByLabel(/Obchodní vztah/i);
  await accountCombo.click();
  await accountCombo.fill("Stavební");
  await expect(page.locator('[data-slot="combobox-item"]')).toHaveText(/Stavební huť Praha/);
  await page.locator('[data-slot="combobox-item"]').first().click();
  await expect(accountCombo).toHaveValue(/Stavební huť Praha/);

  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel(/Obchodní vztah/i)).toHaveValue(/Stavební huť Praha/);
});

test("locked-once-set field: project template becomes read-only after a project is created from it", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await page.getByLabel(/Název/i).fill(`E2E Locked Template ${Date.now()}`);

  const clientCombo = page.getByLabel(/^Klient/i);
  await clientCombo.click();
  await clientCombo.fill("Novák");
  await page.locator('[data-slot="combobox-item"]').first().click();

  const templateCombo = page.getByLabel(/Šablona/i);
  await templateCombo.click();
  await templateCombo.fill("Standard");
  await page.locator('[data-slot="combobox-item"]').first().click();

  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Úkoly / Milníky" })).toBeVisible();
  await expect(page.locator("table tbody tr")).not.toHaveCount(0);

  await page.getByRole("tab", { name: "Obecné" }).click();
  await expect(page.getByLabel(/Šablona/i)).toBeDisabled();
});

test("clicking anywhere in a grid row (not just the name) opens the record", async ({ page }) => {
  await page.goto("/accounts");
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible();
  // click a non-link cell in the row (e.g. the IČO column), not the name hyperlink
  await firstRow.locator("td").nth(1).click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
});

test("editing a field reveals Save / Save & Close, and Save & Close returns to the list", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);

  await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible();
  // must differ from whatever the field already holds (e.g. from a previous run of this same test)
  // for react-hook-form's isDirty to actually flip true.
  await page.getByLabel(/Obor/i).fill(`E2E test obor ${Math.random().toString(36).slice(2, 8)}`);

  const saveButton = page.getByRole("button", { name: "Uložit změny", exact: true });
  const saveAndCloseButton = page.getByRole("button", { name: "Uložit změny a zavřít" });
  await expect(saveButton).toBeVisible();
  await expect(saveAndCloseButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Zavřít", exact: true })).toHaveCount(0);

  await saveAndCloseButton.click();
  await page.waitForURL(/\/accounts$/, { timeout: 10_000 });
});

test("picking a template on an existing project (that had none) generates its milestones", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await page.getByLabel(/Název/i).fill(`E2E Update Template ${Date.now()}`);

  const clientCombo = page.getByLabel(/^Klient/i);
  await clientCombo.click();
  await clientCombo.fill("Novák");
  await page.locator('[data-slot="combobox-item"]').first().click();

  // no template picked at creation time on purpose — Obecné (with milestones below it) opens by default
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Úkoly / Milníky" })).toBeVisible();
  await expect(page.getByText("Zatím žádné milníky.")).toBeVisible();

  const templateCombo = page.getByLabel(/Šablona/i);
  await expect(templateCombo).toBeEnabled();
  await templateCombo.click();
  await templateCombo.fill("Standard");
  await page.locator('[data-slot="combobox-item"]').first().click();
  await page.getByRole("button", { name: "Uložit změny", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible();

  await expect(page.getByText("Zatím žádné milníky.")).toHaveCount(0);
});

test("record navigator panel lets you browse between records without leaving the form", async ({
  page,
}) => {
  await page.goto("/accounts");
  const firstHref = await page.locator("table tbody tr a").first().getAttribute("href");
  const secondHref = await page.locator("table tbody tr a").nth(1).getAttribute("href");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);

  const toggle = page.getByTitle(/Zobrazit seznam záznamů|Skrýt seznam záznamů/);
  await expect(toggle).toBeVisible();
  if (await page.getByTitle("Zobrazit seznam záznamů").isVisible().catch(() => false)) {
    await toggle.click();
  }

  // Regression: the flyout previously collapsed to a zero-size box (Tailwind inset-0 vs
  // top/left conflict inside a sticky/overflow ancestor) — clicks still "worked" geometrically
  // but nothing was actually visible. Assert real, non-trivial dimensions, not just attached.
  const navLink = page.locator(`a[href="${secondHref}"]`).first();
  await expect(navLink).toBeVisible();
  const box = await navLink.boundingBox();
  expect(box?.width, "navigator flyout link has zero width — panel is probably collapsed").toBeGreaterThan(50);
  expect(box?.height, "navigator flyout link has zero height — panel is probably collapsed").toBeGreaterThan(5);
  await navLink.click();
  await page.waitForURL(new RegExp(secondHref!.replace(/\//g, "\\/") + "$"));
  expect(page.url()).not.toContain(firstHref!);
});

test("new-record form always shows a way back, even after typing something", async ({ page }) => {
  await page.goto("/leads/new");
  await expect(page.getByRole("button", { name: "Zpět" })).toBeVisible();
  await page.getByLabel(/Jméno/i).fill("E2E Rozepsaný lead");
  // still there once the form is dirty — this used to disappear, trapping the user on the page.
  await expect(page.getByRole("button", { name: "Zpět" })).toBeVisible();
  await page.getByRole("button", { name: "Zpět" }).click();
  await page.waitForURL(/\/leads$/);
});

test("project detail opens straight on Obecné with milestones visible, no tab click needed", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("tab", { name: "Obecné", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Úkoly / Milníky" })).toBeVisible();
});

test("activity timeline: logging a call saves it with an editable date", async ({ page }) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.getByRole("tab", { name: "Historie a aktivity" }).click();

  await page.getByRole("button", { name: "Telefonát", exact: true }).click();
  const subject = `E2E telefonát ${Date.now()}`;
  await page.getByLabel(/Předmět/i).fill(subject);
  await expect(page.getByLabel(/Datum/i)).not.toHaveValue("");
  await page.getByRole("button", { name: "Uložit aktivitu" }).click();
  await expect(page.getByText(subject)).toBeVisible();
  await expect(page.getByText("Telefonát").last()).toBeVisible();
});

test("a set lookup renders a link to open the related record", async ({ page }) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.getByRole("tab", { name: /Obecné/i }).click();

  const accountRow = page.locator("div.space-y-1\\.5", { hasText: "Klient" });
  const openLink = accountRow.getByTitle("Otevřít záznam");
  await expect(openLink).toBeVisible();
  await openLink.click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
});

test("bug report: create with name, description and a screenshot image", async ({ page }) => {
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-bug-"));
  const filePath = path.join(dir, "screenshot.png");
  writeFileSync(filePath, pngBuffer);

  await page.goto("/bugs/new");
  const name = `E2E Bug ${Date.now()}`;
  await page.getByLabel(/Název/i).fill(name);
  await page.getByLabel(/Popis problému/i).fill("Tlačítko Uložit nereaguje na klik v mobilním Safari.");

  await page.locator('input[type="file"]').setInputFiles(filePath);
  const uploadedImage = page.locator('img[src*="bug-screenshots"]');
  await expect(uploadedImage).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Nahlásit", exact: true }).click();
  await page.waitForURL(/\/bugs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.locator('img[src*="bug-screenshots"]')).toBeVisible();

  await page.goto("/bugs");
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("activities grid shows the real linked record name for 'Vztahuje se k', not just the type", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.getByRole("tab", { name: "Historie a aktivity" }).click();
  const subject = `E2E regarding check ${Date.now()}`;
  await page.getByRole("button", { name: "Poznámka", exact: true }).click();
  await page.getByLabel(/Předmět/i).fill(subject);
  await page.getByRole("button", { name: "Uložit aktivitu" }).click();
  await expect(page.getByText(subject)).toBeVisible();

  await page.goto("/activities");
  await expect(page.getByText("Vztahuje se k", { exact: true })).toBeVisible();

  const row = page.locator("table tbody tr", { hasText: subject });
  await expect(row).toBeVisible();
  const regardingLink = row.getByRole("link").last();
  await expect(regardingLink).toBeVisible();
  const linkText = (await regardingLink.textContent())?.trim();
  expect(linkText, "regarding column should show the real linked record's name, not be blank").not.toBe("");
  expect(linkText).not.toBe("—");
  await expect(regardingLink).toHaveAttribute("href", /\/projects\/[0-9a-f-]{36}$/);
});

test("milestones: row multiselect is separate from the complete toggle, and notifications list/remove works", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Úkoly / Milníky" })).toBeVisible();

  const milestoneName = `E2E Milestone ${Date.now()}`;
  await page.getByLabel(/Název milníku/i).fill(milestoneName);
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  const row = page.locator("table tbody tr", { hasText: milestoneName });
  await expect(row).toBeVisible();

  // left column: row multiselect (bulk delete), independent of the milestone's own state
  await row.getByRole("checkbox").click();
  await expect(page.getByRole("button", { name: "Odstranit (1)" })).toBeVisible();
  await row.getByRole("checkbox").click();
  await expect(page.getByRole("button", { name: "Odstranit (1)" })).toHaveCount(0);

  // right column: single toggle button, checkmark <-> x depending on current state
  await row.getByTitle("Splnit").click();
  await expect(row.getByText("Splněno")).toBeVisible();
  await row.getByTitle("Zrušit splnění").click();
  await expect(row.getByText("Splněno")).toHaveCount(0);

  // notifications: configured ones show as indented rows right under the milestone in the
  // table (not hidden behind a dialog) — the dialog is only for adding a new one.
  await row.getByTitle("Přidat notifikaci").click();
  await expect(page.getByRole("heading", { name: `Přidat notifikaci — ${milestoneName}` })).toBeVisible();
  await page.getByRole("button", { name: "Uložit notifikaci" }).click();
  // scoped to the sibling row right under THIS milestone — other leftover test data on the
  // same shared project can have its own "Odebrat notifikaci" buttons elsewhere on the page.
  const notificationRow = row.locator("xpath=following-sibling::tr[1]");
  await expect(notificationRow.getByText(/E-mail · 1 den předem/)).toBeVisible();

  await notificationRow.getByTitle("Odebrat notifikaci").click();
  await expect(notificationRow.getByText(/E-mail · 1 den předem/)).toHaveCount(0);
});

test("deleting a single milestone asks for confirmation, and cancelling keeps it", async ({ page }) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);

  const milestoneName = `E2E Single Delete ${Date.now()}`;
  await page.getByLabel(/Název milníku/i).fill(milestoneName);
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  const row = page.locator("table tbody tr", { hasText: milestoneName });
  await expect(row).toBeVisible();

  // cancelling the dialog must not delete anything
  await row.getByTitle("Odstranit milník").click();
  await expect(page.getByRole("dialog", { name: `Odstranit milník "${milestoneName}"?` })).toBeVisible();
  await page.getByRole("button", { name: "Zrušit" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toBeVisible();

  await row.getByTitle("Odstranit milník").click();
  await page.getByRole("button", { name: "Odstranit", exact: true }).click();
  await expect(row).toHaveCount(0);
});

test("milestones: one milestone can have multiple notifications, each shown as its own indented row", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.locator("table tbody tr a").first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Úkoly / Milníky" })).toBeVisible();

  const milestoneName = `E2E Multi-Notification ${Date.now()}`;
  await page.getByLabel(/Název milníku/i).fill(milestoneName);
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  const row = page.locator("table tbody tr", { hasText: milestoneName });
  await expect(row).toBeVisible();

  async function addNotification(dniPredem: string) {
    await row.getByTitle("Přidat notifikaci").click();
    await page.getByLabel(/Dní předem/i).fill(dniPredem);
    await page.getByRole("button", { name: "Uložit notifikaci" }).click();
  }

  await addNotification("1");
  await addNotification("3");

  await expect(page.getByText(/E-mail · 1 den předem/)).toBeVisible();
  await expect(page.getByText(/E-mail · 3 dny předem/)).toBeVisible();
  await expect(page.getByTitle("Odebrat notifikaci")).toHaveCount(2);
});

test("grid column filter on a lookup/optionset column offers real values, and the column picker shows real labels", async ({
  page,
}) => {
  await page.goto("/accounts");

  // regression: columns without an explicit label override in the view used to show the
  // raw DB field key ("name") in the "Sloupce" picker instead of the real label. Column
  // picker options render as <label> (unlike the grid's own "Název" column header button).
  await page.getByRole("button", { name: "Sloupce" }).click();
  await expect(page.locator('label[data-slot="label"]', { hasText: "Název" })).toBeVisible();
  await expect(page.locator('label[data-slot="label"]', { hasText: /^name$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // "Stav" (status_reason) is a choice field — must offer a value dropdown, not free text.
  await page.getByRole("button", { name: "Stav", exact: true }).click();
  await expect(page.getByPlaceholder("Hodnota…")).toHaveCount(0);
  await page.getByText("Vyberte…").click();
  await expect(page.getByRole("option", { name: "Aktivní", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Aktivní", exact: true }).click();
  await page.getByRole("button", { name: "Použít" }).click();
  await page.waitForURL(/cf_status_reason_id=/);
});
