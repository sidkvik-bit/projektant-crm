import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Vyhledání adresy v RÚIAN (registr adres ČÚZK) nad adresní sekcí formuláře.
 *
 * Průchod UI jede na zastavené odpovědi — jinak by test visel na dostupnosti cizí služby.
 * Že ta služba opravdu odpovídá a náš proxy endpoint drží dohodnutý tvar, kryje poslední test.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const SUGGESTION = "Husova 348/31, Liberec I-Staré Město, 46001 Liberec";

async function stubRuian(page: Page, opts: { suggestions?: unknown[]; address?: unknown } = {}) {
  await page.route("**/api/ruian/address*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("key")) {
      await route.fulfill({
        json: {
          address: opts.address ?? {
            label: SUGGESTION,
            street: "Husova",
            houseNumber: "348/31",
            city: "Liberec",
            zip: "460 01",
            lat: 50.77108713459349,
            lng: 15.06545080188843,
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: { suggestions: opts.suggestions ?? [{ text: SUGGESTION, magicKey: "1_123" }] },
    });
  });
}

test("picking an address from RÚIAN fills the separate address fields on a contact", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const { data: contact } = await admin
    .from("contacts")
    .insert({ organization_id: org!.id, first_name: "Adresní", last_name: `Test ${Date.now()}` })
    .select("id")
    .single();

  try {
    await stubRuian(page);
    await page.goto(`/contacts/${contact!.id}`);

    await page.getByLabel("Najít adresu v registru RÚIAN").fill("Husova 31 Liberec");
    await page.getByRole("button", { name: SUGGESTION }).click();

    await expect(page.getByLabel("Ulice")).toHaveValue("Husova");
    await expect(page.getByLabel("Číslo popisné/orientační")).toHaveValue("348/31");
    await expect(page.getByLabel("Obec")).toHaveValue("Liberec");
    await expect(page.getByLabel("PSČ")).toHaveValue("460 01");
    await expect(page.getByLabel("Stát")).toHaveValue("Česká republika");

    // Výběr formulář neukládá — do databáze se to dostane až běžným Uložit.
    const { data: beforeSave } = await admin
      .from("contacts")
      .select("address_city")
      .eq("id", contact!.id)
      .single();
    expect(beforeSave!.address_city).toBeNull();

    await page.getByRole("button", { name: /^Uložit/ }).first().click();
    await expect(async () => {
      const { data } = await admin
        .from("contacts")
        .select("address_street, address_house_number, address_city, address_zip")
        .eq("id", contact!.id)
        .single();
      expect(data).toMatchObject({
        address_street: "Husova",
        address_house_number: "348/31",
        address_city: "Liberec",
        address_zip: "460 01",
      });
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("contacts").delete().eq("id", contact!.id);
  }
});

test("the address fields stay editable by hand — the lookup is only a shortcut", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const { data: contact } = await admin
    .from("contacts")
    .insert({ organization_id: org!.id, first_name: "Ruční", last_name: `Test ${Date.now()}` })
    .select("id")
    .single();

  try {
    // Služba nic nenajde — uživatel nesmí zůstat zablokovaný.
    await stubRuian(page, { suggestions: [] });
    await page.goto(`/contacts/${contact!.id}`);

    await page.getByLabel("Najít adresu v registru RÚIAN").fill("naprostý nesmysl");
    await expect(page.getByText(/Nic nenalezeno/)).toBeVisible();

    await page.getByLabel("Ulice").fill("Nádražní");
    await page.getByLabel("Obec").fill("Turnov");
    await page.getByRole("button", { name: /^Uložit/ }).first().click();

    await expect(async () => {
      const { data } = await admin
        .from("contacts")
        .select("address_street, address_city")
        .eq("id", contact!.id)
        .single();
      expect(data).toMatchObject({ address_street: "Nádražní", address_city: "Turnov" });
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("contacts").delete().eq("id", contact!.id);
  }
});

test("the project form also offers the lookup, and fills GPS for the map", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org!.id)
    .limit(1)
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org!.id, primary_contact_id: contact!.id, name: `E2E RÚIAN ${Date.now()}` })
    .select("id")
    .single();

  try {
    // Záměrně jiný bod, než jaký by pro tuhle adresu vrátil Mapbox — jinak by test neodlišil
    // "server souřadnice z registru nechal" od "server je přegeokódoval na skoro stejné".
    await stubRuian(page, {
      address: {
        label: SUGGESTION,
        street: "Husova",
        houseNumber: "348/31",
        city: "Liberec",
        zip: "460 01",
        lat: 49.123456,
        lng: 16.654321,
      },
    });
    await page.goto(`/projects/${project!.id}`);

    await page.getByLabel("Najít adresu v registru RÚIAN").fill("Husova 31 Liberec");
    await page.getByRole("button", { name: SUGGESTION }).click();

    // Projekt má na rozdíl od kontaktu souřadnice pro mapu — vyplní se z téhož výběru.
    await expect(page.getByLabel("GPS šířka")).toHaveValue("49.123456");
    await expect(page.getByLabel("GPS délka")).toHaveValue("16.654321");

    // A uložení je nesmí přepsat: server jinak změněnou adresu přegeokóduje Mapboxem. Bod
    // z registru je přesnější, takže má přednost. (Sloupce jsou numeric(9,6).)
    await page.getByRole("button", { name: /^Uložit/ }).first().click();
    await expect(async () => {
      const { data } = await admin.from("projects").select("gps_lat, gps_lng").eq("id", project!.id).single();
      expect(data).toEqual({ gps_lat: 49.123456, gps_lng: 16.654321 });
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("projects").delete().eq("id", project!.id);
  }
});

test("the proxy endpoint really talks to ČÚZK and keeps the agreed shape", async ({ page }) => {
  // Jediný test, který sahá na cizí službu. Výpadek ČÚZK nesmí shodit suite, ale když
  // odpoví, musí to být tvar, na kterém stojí komponenta — proto ta dvě větve.
  await page.goto("/contacts");
  const res = await page.request.get("/api/ruian/address?q=Husova%2031%20Liberec");

  if (res.status() === 502) {
    test.info().annotations.push({ type: "poznámka", description: "ČÚZK zrovna neodpovídá." });
    return;
  }

  expect(res.status()).toBe(200);
  const { suggestions } = (await res.json()) as { suggestions: { text: string; magicKey: string }[] };
  expect(suggestions.length).toBeGreaterThan(0);
  expect(suggestions[0]).toMatchObject({ text: expect.stringContaining("Liberec"), magicKey: expect.any(String) });

  const detail = await page.request.get(
    `/api/ruian/address?q=${encodeURIComponent(suggestions[0].text)}&key=${encodeURIComponent(suggestions[0].magicKey)}`,
  );
  expect(detail.status()).toBe(200);
  const { address } = (await detail.json()) as {
    address: { street: string; houseNumber: string; city: string; zip: string; lat: number; lng: number };
  };
  expect(address.city).toContain("Liberec");
  expect(address.zip).toMatch(/^\d{3} \d{2}$/);
  // WGS84, ne S-JTSK v metrech (to by bylo kolem -678000).
  expect(address.lat).toBeGreaterThan(48);
  expect(address.lat).toBeLessThan(52);
  expect(address.lng).toBeGreaterThan(12);
  expect(address.lng).toBeLessThan(19);
});
