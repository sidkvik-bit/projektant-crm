import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Druhá dávka připomínek projektanta: plátcovství DPH jako nastavení firmy, volba odběratele
 * na dokladu, číslo nabídky ve formuláři a výběr položek při fakturaci.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function testOrgId(admin: ReturnType<typeof adminClient>) {
  const { data } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  return data!.id as string;
}

async function seedQuote(admin: ReturnType<typeof adminClient>, suffix: number, withCompany: boolean) {
  const orgId = await testOrgId(admin);

  let accountId: string | null = null;
  if (withCompany) {
    const { data: account } = await admin
      .from("accounts")
      .insert({ organization_id: orgId, name: `E2E Firma ${suffix}` })
      .select("id")
      .single();
    accountId = account!.id;
  }

  const { data: contact } = await admin
    .from("contacts")
    .insert({ organization_id: orgId, first_name: "Odběratel", last_name: `Test ${suffix}`, account_id: accountId })
    .select("id")
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: orgId, primary_contact_id: contact!.id, name: `E2E DPH Projekt ${suffix}` })
    .select("id")
    .single();
  const { data: quote } = await admin
    .from("quotes")
    .insert({ organization_id: orgId, project_id: project!.id, contact_id: contact!.id, name: `E2E Nabídka ${suffix}` })
    .select("id, number, odberatel_je_firma")
    .single();

  return {
    orgId,
    accountId,
    contactId: contact!.id as string,
    projectId: project!.id as string,
    quote: quote as { id: string; number: string; odberatel_je_firma: boolean },
  };
}

async function cleanup(
  admin: ReturnType<typeof adminClient>,
  ids: { quoteId?: string; projectId: string; contactId: string; accountId: string | null },
) {
  if (ids.quoteId) {
    await admin.from("invoices").delete().eq("quote_id", ids.quoteId);
    await admin.from("quotes").delete().eq("id", ids.quoteId);
  }
  await admin.from("projects").delete().eq("id", ids.projectId);
  await admin.from("contacts").delete().eq("id", ids.contactId);
  if (ids.accountId) await admin.from("accounts").delete().eq("id", ids.accountId);
}

test("the VAT switch lives in settings and decides what a new document gets", async ({ page }) => {
  const admin = adminClient();
  const orgId = await testOrgId(admin);
  const { data: before } = await admin
    .from("organizations")
    .select("je_platce_dph, default_vat_rate, dic")
    .eq("id", orgId)
    .single();

  try {
    await admin.from("organizations").update({ je_platce_dph: false }).eq("id", orgId);
    await page.goto("/settings/invoicing");

    // Neplátci nemá smysl ukazovat DIČ ani sazbu — jsou to údaje plátce.
    await expect(page.getByLabel("DIČ")).toHaveCount(0);
    await expect(page.getByLabel(/Výchozí sazba DPH/)).toHaveCount(0);

    await page.getByRole("checkbox", { name: "Jsme plátce DPH" }).check();
    await expect(page.getByLabel("DIČ")).toBeVisible();
    await page.getByLabel(/Výchozí sazba DPH/).fill("15");
    await page.getByRole("button", { name: "Uložit" }).click();

    await expect(async () => {
      const { data } = await admin
        .from("organizations")
        .select("je_platce_dph, default_vat_rate")
        .eq("id", orgId)
        .single();
      expect(data).toMatchObject({ je_platce_dph: true, default_vat_rate: 15 });
    }).toPass({ timeout: 10_000 });

    // A nová nabídka si tu sazbu vezme — dřív bylo 21 % natvrdo v kódu.
    await page.goto("/quotes/new");
    await expect(page.getByLabel(/Sazba DPH/)).toHaveValue("15");

    // Neplátce dostane nulu, ne "pro jistotu" 21.
    await admin.from("organizations").update({ je_platce_dph: false }).eq("id", orgId);
    await page.goto("/quotes/new");
    await expect(page.getByLabel(/Sazba DPH/)).toHaveValue("0");
  } finally {
    await admin.from("organizations").update(before!).eq("id", orgId);
  }
});

test("a quote shows its number on the form, and it can be overridden", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const seeded = await seedQuote(admin, suffix, false);

  try {
    await page.goto(`/quotes/${seeded.quote.id}`);
    const numberInput = page.getByLabel("Číslo nabídky");
    await expect(numberInput).toHaveValue(seeded.quote.number);

    const custom = `RUCNI-${suffix}`;
    await numberInput.fill(custom);
    await page.getByRole("button", { name: /^Uložit změny/ }).first().click();

    await expect(async () => {
      const { data } = await admin.from("quotes").select("number").eq("id", seeded.quote.id).single();
      expect(data!.number).toBe(custom);
    }).toPass({ timeout: 10_000 });
  } finally {
    await cleanup(admin, { ...seeded, quoteId: seeded.quote.id });
  }
});

test("the billing target defaults from the contact's company, and stays a per-document choice", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const withCompany = await seedQuote(admin, suffix, true);
  const privateOne = await seedQuote(admin, suffix + 1, false);

  try {
    // Dosavadní chování: kontakt má firmu -> doklad na firmu. Bez firmy na osobu.
    expect(withCompany.quote.odberatel_je_firma).toBe(true);
    expect(privateOne.quote.odberatel_je_firma).toBe(false);

    // Zaměstnanec firmy si objedná projekt soukromě — tohle dřív nešlo vyjádřit.
    await page.goto(`/quotes/${withCompany.quote.id}`);
    await page.getByRole("checkbox", { name: "Vystavit na firmu objednatele" }).uncheck();
    await page.getByRole("button", { name: /^Uložit změny/ }).first().click();

    await expect(async () => {
      const { data } = await admin
        .from("quotes")
        .select("odberatel_je_firma")
        .eq("id", withCompany.quote.id)
        .single();
      expect(data!.odberatel_je_firma).toBe(false);
    }).toPass({ timeout: 10_000 });

    // PDF se v obou režimech vyrenderuje (odběratel se liší, ale doklad nespadne).
    const pdf = await page.request.get(`/api/quotes/${withCompany.quote.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  } finally {
    await cleanup(admin, { ...withCompany, quoteId: withCompany.quote.id });
    await cleanup(admin, { ...privateOne, quoteId: privateOne.quote.id });
  }
});

test("invoicing from a quote copies only the items that were ticked", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const seeded = await seedQuote(admin, suffix, false);

  await admin.from("quote_items").insert([
    { organization_id: seeded.orgId, quote_id: seeded.quote.id, name: "Studie", quantity: 1, unit: "ks", unit_price: 10000, sort_order: 1 },
    { organization_id: seeded.orgId, quote_id: seeded.quote.id, name: "Vizualizace", quantity: 2, unit: "ks", unit_price: 2500, sort_order: 2 },
    { organization_id: seeded.orgId, quote_id: seeded.quote.id, name: "Dozor", quantity: 1, unit: "ks", unit_price: 5000, sort_order: 3 },
  ]);

  try {
    await page.goto(`/quotes/${seeded.quote.id}`);
    await page.getByRole("button", { name: "Vygenerovat fakturu" }).click();

    // Výchozí stav je "fakturuju všechno" — odškrtává se, co se nedodělalo.
    await expect(page.getByText("Vybráno 3 z 3")).toBeVisible();
    await page.getByRole("checkbox", { name: /Dozor/ }).uncheck();
    await expect(page.getByText("Vybráno 2 z 3")).toBeVisible();

    await page.getByRole("button", { name: "Vystavit fakturu" }).click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);

    const invoiceId = page.url().split("/").pop()!;
    const { data: items } = await admin
      .from("invoice_items")
      .select("name")
      .eq("invoice_id", invoiceId)
      .order("sort_order");
    expect(items!.map((i) => i.name)).toEqual(["Studie", "Vizualizace"]);
  } finally {
    await admin.from("quote_items").delete().eq("quote_id", seeded.quote.id);
    await cleanup(admin, { ...seeded, quoteId: seeded.quote.id });
  }
});

test("paying by card is gone — the projektant takes cash or a transfer", async () => {
  const admin = adminClient();
  const { data } = await admin
    .from("option_set_values")
    .select("value_key, option_sets!inner(key)")
    .eq("option_sets.key", "forma_uhrady");

  const keys = [...new Set((data ?? []).map((v) => v.value_key))].sort();
  expect(keys).toEqual(["hotove", "prevodem"]);
});

// ---------------------------------------------------------------------------
// Regrese z revize (database-reviewer + silent-failure-hunter)
// ---------------------------------------------------------------------------

async function withVatPayer<T>(admin: ReturnType<typeof adminClient>, payer: boolean, run: () => Promise<T>) {
  const orgId = await testOrgId(admin);
  const { data: before } = await admin
    .from("organizations")
    .select("je_platce_dph, default_vat_rate")
    .eq("id", orgId)
    .single();
  await admin.from("organizations").update({ je_platce_dph: payer }).eq("id", orgId);
  try {
    return await run();
  } finally {
    await admin.from("organizations").update(before!).eq("id", orgId);
  }
}

test("an invoice generated from a quote keeps 'bill the person', even when the contact has a company", async ({
  page,
}) => {
  const admin = adminClient();
  const seeded = await seedQuote(admin, Date.now(), true);
  expect(seeded.quote.odberatel_je_firma).toBe(true);

  try {
    await admin.from("quotes").update({ odberatel_je_firma: false }).eq("id", seeded.quote.id);
    await admin.from("quote_items").insert({
      organization_id: seeded.orgId,
      quote_id: seeded.quote.id,
      name: "Studie",
      quantity: 1,
      unit: "ks",
      unit_price: 10000,
    });

    await page.goto(`/quotes/${seeded.quote.id}`);
    await page.getByRole("button", { name: "Vygenerovat fakturu" }).click();
    await page.getByRole("button", { name: "Vystavit fakturu" }).click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);

    // Dřív to BEFORE INSERT trigger na faktuře přepsal zpátky na firmu.
    const invoiceId = page.url().split("/").pop()!;
    const { data: invoice } = await admin.from("invoices").select("odberatel_je_firma").eq("id", invoiceId).single();
    expect(invoice!.odberatel_je_firma).toBe(false);
  } finally {
    await admin.from("quote_items").delete().eq("quote_id", seeded.quote.id);
    await cleanup(admin, { ...seeded, quoteId: seeded.quote.id });
  }
});

test("VAT status is frozen on the document — switching it in settings doesn't rewrite issued ones", async () => {
  const admin = adminClient();
  const suffix = Date.now();

  const issuedAsPayer = await withVatPayer(admin, true, () => seedQuote(admin, suffix, false));
  try {
    await withVatPayer(admin, false, async () => {
      const { data: frozen } = await admin
        .from("quotes")
        .select("je_platce_dph, vat_rate")
        .eq("id", issuedAsPayer.quote.id)
        .single();
      expect(frozen!.je_platce_dph).toBe(true);
      expect(Number(frozen!.vat_rate)).toBeGreaterThan(0);

      // Neplátce nemůže mít DPH ani když ji někdo pošle — trigger sazbu vynuluje.
      const { data: nonPayerQuote, error } = await admin
        .from("quotes")
        .insert({
          organization_id: issuedAsPayer.orgId,
          project_id: issuedAsPayer.projectId,
          contact_id: issuedAsPayer.contactId,
          name: `E2E Neplátce ${suffix}`,
          vat_rate: 21,
        })
        .select("id, je_platce_dph, vat_rate")
        .single();
      expect(error).toBeNull();
      expect(nonPayerQuote!.je_platce_dph).toBe(false);
      expect(Number(nonPayerQuote!.vat_rate)).toBe(0);
      await admin.from("quotes").delete().eq("id", nonPayerQuote!.id);
    });
  } finally {
    await cleanup(admin, { ...issuedAsPayer, quoteId: issuedAsPayer.quote.id });
  }
});

test("a second colleague in the company doesn't zero the VAT rate on new documents", async ({ page }) => {
  const admin = adminClient();
  const orgId = await testOrgId(admin);
  const email = `e2e-colleague-${Date.now()}@projektant-crm.test`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: `E2eColleague!${Date.now()}`,
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const colleagueId = created.user!.id;

  const { data: before } = await admin
    .from("organizations")
    .select("je_platce_dph, default_vat_rate")
    .eq("id", orgId)
    .single();

  try {
    const { error: rowErr } = await admin
      .from("users")
      .upsert({ user_id: colleagueId, organization_id: orgId, email, first_name: "Kolega", last_name: "E2E" });
    expect(rowErr).toBeNull();
    await admin.from("organizations").update({ je_platce_dph: true, default_vat_rate: 15 }).eq("id", orgId);

    // Dřív dotaz bez filtru na přihlášeného uživatele vrátil dva řádky, maybeSingle() selhal
    // a formulář tiše dostal "neplátce, 0 %".
    await page.goto("/quotes/new");
    await expect(page.getByLabel(/Sazba DPH/)).toHaveValue("15");
    await page.goto("/invoices/new");
    await expect(page.getByLabel(/Sazba DPH/)).toHaveValue("15");
  } finally {
    await admin.from("organizations").update(before!).eq("id", orgId);
    await admin.from("users").delete().eq("user_id", colleagueId);
    await admin.auth.admin.deleteUser(colleagueId);
  }
});

test("invoicing stops with a clear message when a ticked item was deleted meanwhile", async ({ page }) => {
  const admin = adminClient();
  const seeded = await seedQuote(admin, Date.now(), false);

  const { data: items } = await admin
    .from("quote_items")
    .insert([
      { organization_id: seeded.orgId, quote_id: seeded.quote.id, name: "Studie", quantity: 1, unit: "ks", unit_price: 10000, sort_order: 1 },
      { organization_id: seeded.orgId, quote_id: seeded.quote.id, name: "Vizualizace", quantity: 1, unit: "ks", unit_price: 2500, sort_order: 2 },
      { organization_id: seeded.orgId, quote_id: seeded.quote.id, name: "Dozor", quantity: 1, unit: "ks", unit_price: 5000, sort_order: 3 },
    ])
    .select("id, name");

  try {
    await page.goto(`/quotes/${seeded.quote.id}`);
    await page.getByRole("button", { name: "Vygenerovat fakturu" }).click();
    await page.getByRole("checkbox", { name: /Dozor/ }).uncheck();

    // Položku mezitím smaže někdo v jiném okně.
    await admin.from("quote_items").delete().eq("id", items!.find((i) => i.name === "Vizualizace")!.id);

    await page.getByRole("button", { name: "Vystavit fakturu" }).click();
    await expect(page.getByText(/Některé vybrané položky už v nabídce nejsou/)).toBeVisible();

    // A nevznikla žádná (ani prázdná) faktura.
    const { count } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", seeded.quote.id);
    expect(count).toBe(0);
  } finally {
    await admin.from("quote_items").delete().eq("quote_id", seeded.quote.id);
    await cleanup(admin, { ...seeded, quoteId: seeded.quote.id });
  }
});

test("a cleared VAT rate in settings is refused, not saved as 0 %", async ({ page }) => {
  const admin = adminClient();
  const orgId = await testOrgId(admin);

  await withVatPayer(admin, true, async () => {
    await admin.from("organizations").update({ default_vat_rate: 21 }).eq("id", orgId);
    await page.goto("/settings/invoicing");
    await page.getByLabel(/Výchozí sazba DPH/).fill("");
    await page.getByRole("button", { name: "Uložit" }).click();

    await expect(page.getByText("Výchozí sazba DPH musí být číslo od 0 do 100.")).toBeVisible();
    const { data } = await admin.from("organizations").select("default_vat_rate").eq("id", orgId).single();
    expect(Number(data!.default_vat_rate)).toBe(21);
  });
});
