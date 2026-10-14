import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Úpravy podle připomínek projektanta, který appku testoval.
 *
 * Každý test tu kryje jednu konkrétní připomínku — u většiny z nich šlo o to, že něco prostě
 * nešlo udělat (posunout termín milníku, zapsat víc parcel, změnit si jméno), takže by chybějící
 * funkci nezachytil žádný stávající test.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function seedProject(admin: ReturnType<typeof adminClient>, suffix: number) {
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
      name: `E2E Feedback Projekt ${suffix}`,
      katastralni_uzemi: "Turnov",
    })
    .select("id")
    .single();
  return { orgId: org!.id as string, contactId: contact!.id as string, projectId: project!.id as string };
}

test("a milestone's date can be moved — picking a template no longer locks the schedule", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const { projectId } = await seedProject(admin, suffix);
  const milestoneName = `Studie ${suffix}`;
  await admin.from("project_milestones").insert({
    organization_id: (await admin.from("projects").select("organization_id").eq("id", projectId).single()).data!
      .organization_id,
    project_id: projectId,
    name: milestoneName,
    termin_splneni: "2027-01-31",
  });

  try {
    await page.goto(`/projects/${projectId}`);
    const dateInput = page.getByLabel(`Termín milníku ${milestoneName}`);
    await expect(dateInput).toHaveValue("2027-01-31");

    await dateInput.fill("2027-03-15");
    await dateInput.blur();
    await expect(async () => {
      const { data } = await admin
        .from("project_milestones")
        .select("termin_splneni")
        .eq("project_id", projectId)
        .single();
      expect(data!.termin_splneni).toBe("2027-03-15");
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("project_milestones").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
});

test("a project can carry several parcels, each marked building or land", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const { projectId } = await seedProject(admin, suffix);

  try {
    // Našeptávač z katastru má vlastní test (ruian-parcel.spec.ts); tady jde o ruční zápis,
    // tak ať do toho ČÚZK nemluví.
    await page.route("**/api/ruian/parcel*", (route) => route.fulfill({ json: { parcels: [] } }));
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Parcely" }).click();
    await expect(page.getByText(/zatím není zapsaná žádná parcela/)).toBeVisible();

    // Katastrální území se předvyplní z projektu — u jednoho projektu se skoro vždy opakuje.
    await expect(page.getByLabel("Katastrální území")).toHaveValue("Turnov");

    await page.getByLabel("Parcelní číslo").fill("1247/3");
    await page.getByLabel("Druh").click();
    await page.getByRole("option", { name: "Stavební" }).click();
    await page.getByRole("button", { name: "Přidat" }).click();
    await expect(page.getByText("parc. č. 1247/3")).toBeVisible();

    // Druh se po přidání vrátil na Pozemková — druhá parcela tak vznikne jiného druhu.
    await page.getByLabel("Parcelní číslo").fill("1248");
    await page.getByRole("button", { name: "Přidat" }).click();
    await expect(page.getByText("parc. č. 1248")).toBeVisible();

    const { data: rows } = await admin
      .from("project_parcels")
      .select("parcelni_cislo, druh, katastralni_uzemi")
      .eq("project_id", projectId)
      .order("parcelni_cislo");
    expect(rows).toHaveLength(2);
    expect(rows!.map((r) => r.druh).sort()).toEqual(["pozemkova", "stavebni"]);
    expect(rows!.every((r) => r.katastralni_uzemi === "Turnov")).toBe(true);
  } finally {
    await admin.from("project_parcels").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
});

test("a new quote arrives pre-filled with a name and a validity date", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const { orgId, contactId, projectId } = await seedProject(admin, suffix);
  await admin.from("project_parcels").insert({
    organization_id: orgId,
    project_id: projectId,
    parcelni_cislo: "1247/3",
    druh: "stavebni",
    katastralni_uzemi: "Turnov",
  });

  try {
    await page.goto(`/quotes/new?project_id=${projectId}&contact_id=${contactId}`);
    // Tester nechce nabídky pojmenovávat ručně — název se skládá z projektu a jeho parcel.
    await expect(page.getByLabel(/Název nabídky/i)).toHaveValue(
      `Cenová nabídka – E2E Feedback Projekt ${suffix} (parc. č. 1247/3, k. ú. Turnov)`,
    );
    // Platnost se bere z nastavení firmy, ne aby se vyplňovala pokaždé znovu.
    await expect(page.getByLabel(/Platnost do/i)).not.toHaveValue("");
  } finally {
    await admin.from("project_parcels").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
});

test("the invoice supplier name can differ from the organization's name", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id, supplier_name").eq("name", "E2E Test Org").single();

  try {
    await page.goto("/settings/invoicing");
    // Předčíslí zmizelo — číslo faktury je nově holé 20260901, takže by to bylo mrtvé políčko.
    await expect(page.getByLabel("Předčíslí")).toHaveCount(0);

    await page.getByLabel("Název dodavatele").fill("Jan Havlín");
    await page.getByRole("button", { name: /Uložit/i }).click();

    await expect(async () => {
      const { data } = await admin.from("organizations").select("supplier_name").eq("id", org!.id).single();
      expect(data!.supplier_name).toBe("Jan Havlín");
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin.from("organizations").update({ supplier_name: org!.supplier_name }).eq("id", org!.id);
  }
});

test("a user can change their own name", async ({ page }) => {
  const admin = adminClient();
  const { data: before } = await admin
    .from("users")
    .select("user_id, first_name, last_name")
    .eq("email", "e2e-tester@projektant-crm.test")
    .single();

  try {
    await page.goto("/settings/profile");
    await expect(page.getByLabel("Jméno")).toHaveValue(before!.first_name ?? "");
    // E-mail je přihlašovací údaj, mění se přes Google — tady musí být jen ke čtení.
    await expect(page.getByLabel("E-mail")).toBeDisabled();

    await page.getByLabel("Příjmení").fill("Přejmenovaný");
    await page.getByRole("button", { name: "Uložit" }).click();

    await expect(async () => {
      const { data } = await admin.from("users").select("last_name").eq("user_id", before!.user_id).single();
      expect(data!.last_name).toBe("Přejmenovaný");
    }).toPass({ timeout: 10_000 });
  } finally {
    await admin
      .from("users")
      .update({ first_name: before!.first_name, last_name: before!.last_name })
      .eq("user_id", before!.user_id);
  }
});

test("invoice numbers are year+month+order, and the variable symbol matches", async () => {
  const admin = adminClient();
  const suffix = Date.now();
  const { orgId, contactId, projectId } = await seedProject(admin, suffix);

  try {
    const { data: invoice } = await admin
      .from("invoices")
      .insert({ organization_id: orgId, name: `E2E Číslo ${suffix}`, project_id: projectId, contact_id: contactId })
      .select("number, variabilni_symbol, datum_vystaveni, datum_splatnosti")
      .single();

    const now = new Date();
    const expectedPrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(invoice!.number.startsWith(expectedPrefix), `číslo ${invoice!.number} nezačíná ${expectedPrefix}`).toBe(true);
    // Tester chce variabilní symbol rovný číslu faktury — u holého číselného tvaru to vyjde samo.
    expect(invoice!.variabilni_symbol).toBe(invoice!.number);

    // Splatnost se dopočítá z data vystavení a lhůty v nastavení firmy.
    expect(invoice!.datum_splatnosti).not.toBeNull();
    expect(new Date(invoice!.datum_splatnosti!) > new Date(invoice!.datum_vystaveni)).toBe(true);

    await admin.from("invoices").delete().eq("number", invoice!.number);
  } finally {
    await admin.from("projects").delete().eq("id", projectId);
  }
});

test("quote numbers come from a per-organization counter, not a shared sequence", async () => {
  const admin = adminClient();
  const suffix = Date.now();
  const { orgId, contactId, projectId } = await seedProject(admin, suffix);

  try {
    const numbers: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { data } = await admin
        .from("quotes")
        .insert({ organization_id: orgId, name: `E2E Nabídka ${suffix}-${i}`, project_id: projectId, contact_id: contactId })
        .select("number")
        .single();
      numbers.push(data!.number);
    }

    // Dřív šla čísla ze sekvence sdílené všemi organizacemi, takže jedné firmě přeskakovala
    // podle toho, kdo jiný zrovna vystavil nabídku. Dvě po sobě jdoucí musí navazovat.
    const seq = numbers.map((n) => Number(n.replace(/^NAB-\d{4}-/, "")));
    expect(seq[1]).toBe(seq[0] + 1);

    await admin.from("quotes").delete().in("number", numbers);
  } finally {
    await admin.from("projects").delete().eq("id", projectId);
  }
});
