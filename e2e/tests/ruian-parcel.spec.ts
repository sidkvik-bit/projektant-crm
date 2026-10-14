import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Vyhledání parcely v katastru (vrstva Parcela mapové služby ČÚZK) v panelu parcel na projektu.
 *
 * Průchod UI jede na zastavené odpovědi, ať test nevisí na dostupnosti cizí služby; že ta služba
 * odpovídá a náš endpoint drží dohodnutý tvar, kryje poslední test.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function seedProject(admin: ReturnType<typeof adminClient>) {
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org!.id)
    .limit(1)
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({
      organization_id: org!.id,
      primary_contact_id: contact!.id,
      name: `E2E Parcely ${Date.now()}`,
      katastralni_uzemi: "Turnov",
    })
    .select("id")
    .single();
  return project!.id as string;
}

async function stubParcels(page: Page, parcels: unknown[]) {
  await page.route("**/api/ruian/parcel*", (route) => route.fulfill({ json: { parcels } }));
}

test("picking a parcel from the cadastre fills its number, kind and area", async ({ page }) => {
  const admin = adminClient();
  const projectId = await seedProject(admin);

  try {
    // Totéž číslo obojího druhu — přesně kvůli tomuhle se druh nehádá, ale bere z katastru.
    await stubParcels(page, [
      { cisloParcely: "88", druh: "pozemkova", vymeraM2: 345, katastralniUzemi: "Libhošť" },
      { cisloParcely: "88", druh: "stavebni", vymeraM2: 680, katastralniUzemi: "Libhošť" },
    ]);
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Parcely" }).click();

    await page.getByLabel("Parcelní číslo").fill("88");
    const stavebni = page.getByRole("button", { name: /88.*Stavební.*680.*Libhošť/ });
    await expect(stavebni).toBeVisible();
    await stavebni.click();

    // Druh i oficiální název katastrálního území přišly z registru, uživatel je netrefoval.
    await expect(page.getByLabel("Druh")).toContainText("Stavební");
    await expect(page.getByLabel("Katastrální území")).toHaveValue("Libhošť");

    await page.getByRole("button", { name: "Přidat" }).click();
    await expect(page.getByText("parc. č. 88")).toBeVisible();
    await expect(page.getByText("680 m²")).toBeVisible();

    await expect(async () => {
      const { data: rows } = await admin
        .from("project_parcels")
        .select("parcelni_cislo, druh, katastralni_uzemi, vymera_m2")
        .eq("project_id", projectId);
      expect(rows).toEqual([
        { parcelni_cislo: "88", druh: "stavebni", katastralni_uzemi: "Libhošť", vymera_m2: 680 },
      ]);
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("project_parcels").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
});

test("a parcel the cadastre does not know can still be written by hand, without an area", async ({ page }) => {
  const admin = adminClient();
  const projectId = await seedProject(admin);

  try {
    await stubParcels(page, []);
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Parcely" }).click();

    await page.getByLabel("Parcelní číslo").fill("9999");
    await expect(page.getByText(/V katastru nic/)).toBeVisible();
    await page.getByRole("button", { name: "Přidat" }).click();
    await expect(page.getByText("parc. č. 9999")).toBeVisible();

    await expect(async () => {
      const { data: rows } = await admin
        .from("project_parcels")
        .select("parcelni_cislo, vymera_m2")
        .eq("project_id", projectId);
      expect(rows).toEqual([{ parcelni_cislo: "9999", vymera_m2: null }]);
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("project_parcels").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
});

test("the parcel endpoint really talks to ČÚZK and keeps the agreed shape", async ({ page }) => {
  await page.goto("/projects");
  const res = await page.request.get("/api/ruian/parcel?ku=Turnov&q=1247");

  if (res.status() === 502) {
    test.info().annotations.push({ type: "poznámka", description: "ČÚZK zrovna neodpovídá." });
    return;
  }

  expect(res.status()).toBe(200);
  const { parcels } = (await res.json()) as {
    parcels: { cisloParcely: string; druh: string; vymeraM2: number | null; katastralniUzemi: string }[];
  };
  expect(parcels.length).toBeGreaterThan(0);
  for (const p of parcels) {
    expect(p.cisloParcely.startsWith("1247")).toBe(true);
    expect(["stavebni", "pozemkova"]).toContain(p.druh);
    expect(p.katastralniUzemi).toBe("Turnov");
  }

  // Nesmyslné číslo se do dotazu vůbec nedostane, natož aby něco vrátilo.
  const injected = await page.request.get(`/api/ruian/parcel?ku=Turnov&q=${encodeURIComponent("1' or '1'='1")}`);
  expect(injected.status()).toBe(200);
  expect((await injected.json()).parcels).toEqual([]);
});
