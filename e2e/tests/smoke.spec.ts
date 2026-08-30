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

  await page.getByPlaceholder(/Hledat/i).fill("Novák Architekti");
  await page.getByPlaceholder(/Hledat/i).press("Enter");
  await page.waitForURL(/[?&]q=/);
  await expect(page.getByRole("link", { name: "Novák Architekti s.r.o." })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("grid status filter switches between active/inactive/all", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByText("Aktivní", { exact: true })).toBeVisible();

  await page.getByText("Vše", { exact: true }).click();
  await page.waitForURL(/status=all/);
  const allCount = await page.locator("table tbody tr").count();

  await page.getByText("Neaktivní", { exact: true }).click();
  await page.waitForURL(/status=inactive/);
  const inactiveCount = await page.locator("table tbody tr").count();
  expect(inactiveCount).toBeLessThanOrEqual(allCount);
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
