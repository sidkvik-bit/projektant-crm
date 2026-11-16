import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createUserWithRole } from "../lib/roleUser";

/**
 * Vrstva úprav firmy (src/customization, docs/upravy-firmy). Každý test má vlastní firmu
 * s customizerem, ať úpravy neprosáknou do ostatních testů — úpravy platí pro celou firmu.
 */

type Admin = Awaited<ReturnType<typeof createUserWithRole>>["admin"];

/** Publikovaná komponenta rovnou v DB — pro testy, které zkouší běh, ne studio. */
async function seedPublished(admin: Admin, orgId: string, rows: { type: string; entity: string; key: string; definition: unknown }[]) {
  const { error } = await admin.from("customization_components").insert(
    rows.map((r) => ({
      organization_id: orgId,
      component_type: r.type,
      entity_name: r.entity,
      key: r.key,
      published: r.definition,
    })),
  );
  if (error) throw error;
}

async function fillBug(page: Page, name: string, description = "Popis z E2E") {
  await page.getByRole("textbox", { name: /^Název/ }).fill(name);
  await page.getByLabel("Popis problému").fill(description);
}

test("a Basic User has no studio and cannot write customizations even directly", async ({ browser }) => {
  const user = await createUserWithRole("Basic User", "custbasic");
  const context = await browser.newContext({ storageState: user.storageState });
  const page = await context.newPage();
  try {
    const response = await page.goto("/settings/customization");
    expect(response?.status()).toBe(404);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Přizpůsobení" })).toHaveCount(0);

    // RLS: ani přímý zápis přes API pod jeho přihlášením neprojde.
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: user.email, password: user.password });
    const { error } = await client
      .from("customization_components")
      .insert({ component_type: "field", entity_name: "Bug", key: "new_x", draft: { label: "X", type: "text" } });
    expect(error).not.toBeNull();
  } finally {
    await context.close();
    await user.cleanup();
  }
});

test("customizer adds a field in the studio, previews it, publishes it, and can revert the publish", async ({ browser }) => {
  const user = await createUserWithRole("System Customizer", "custfield");
  const context = await browser.newContext({ storageState: user.storageState });
  const page = await context.newPage();
  try {
    await page.goto("/settings/customization/Bug");
    await page.getByRole("button", { name: "Nové pole" }).click();
    await page.getByLabel("Popisek").fill("Číslo zakázky");
    await expect(page.getByLabel("Systémový název")).toHaveValue("new_cislo_zakazky");
    await page.getByRole("button", { name: "Uložit do rozpracovaných" }).click();
    await expect(page.getByText("Nové — nepublikováno")).toBeVisible();

    // Nepublikované pole uživatelé nevidí…
    await page.goto("/bugs/new");
    await expect(page.getByLabel("Číslo zakázky")).toHaveCount(0);

    // …customizer ho vidí v náhledu.
    await page.goto("/settings/customization");
    await page.getByRole("button", { name: "Náhled změn" }).click();
    await expect(page.getByText("Náhled rozpracovaných úprav")).toBeVisible();
    await page.goto("/bugs/new");
    await expect(page.getByLabel("Číslo zakázky")).toBeVisible();

    await page.goto("/settings/customization/publish");
    await page.getByLabel("Popis změny").fill("Číslo zakázky na bugu");
    await page.getByRole("button", { name: /Publikovat 1 změnu/ }).click();
    await page.getByRole("button", { name: "Ano, publikovat" }).click();
    await page.waitForURL(/\/settings\/customization\/history/);
    await expect(page.getByText("Číslo zakázky na bugu")).toBeVisible();
    await page.getByRole("button", { name: "Ukončit náhled" }).click();
    await expect(page.getByText("Náhled rozpracovaných úprav")).toHaveCount(0);

    // Publikované pole funguje pro běžné uložení a hodnota je v jsonb sloupci custom.
    await page.goto("/bugs/new");
    await fillBug(page, "Bug s číslem zakázky");
    await page.getByLabel("Číslo zakázky").fill("Z-42");
    await page.getByRole("button", { name: "Nahlásit" }).click();
    await page.waitForURL(/\/bugs\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Číslo zakázky")).toHaveValue("Z-42");
    const { data: bug } = await user.admin
      .from("bugs")
      .select("custom")
      .eq("organization_id", user.orgId)
      .eq("name", "Bug s číslem zakázky")
      .single();
    expect(bug!.custom).toEqual({ new_cislo_zakazky: "Z-42" });

    // Vrácení publikace pole zase schová — data v záznamu zůstanou.
    await page.goto("/settings/customization/history");
    await page.getByRole("button", { name: "Vrátit" }).click();
    await page.getByRole("button", { name: "Připravit vrácení" }).click();
    await page.waitForURL(/\/settings\/customization\/publish/);
    await expect(page.getByText("Ke smazání — nepublikováno")).toBeVisible();
    await page.getByRole("button", { name: /Publikovat 1 změnu/ }).click();
    await page.getByRole("button", { name: "Ano, publikovat" }).click();
    await page.waitForURL(/\/settings\/customization\/history/);
    await page.goto("/bugs/new");
    await expect(page.getByRole("textbox", { name: /^Název/ })).toBeVisible();
    await expect(page.getByLabel("Číslo zakázky")).toHaveCount(0);
  } finally {
    await context.close();
    await user.cleanup();
  }
});

test("plugins validate and fill values, client scripts drive the form without network, buttons run plugins", async ({ browser }) => {
  const user = await createUserWithRole("System Customizer", "custrun");
  await seedPublished(user.admin, user.orgId, [
    { type: "field", entity: "Bug", key: "new_stav", definition: { label: "Stav opravy", type: "text" } },
    {
      type: "plugin",
      entity: "Bug",
      key: "validace",
      definition: {
        events: ["beforeCreate", "beforeUpdate"],
        code: `async function run(ctx) {
  console.log("plugin běžel", ctx.event);
  if (String(ctx.record.name).includes("zakázáno")) throw new Error("Tenhle název firma nepovoluje");
  ctx.setValue("description", "Doplněno pluginem");
}`,
      },
    },
    {
      type: "plugin",
      entity: "Bug",
      key: "oznacit",
      definition: {
        events: ["command"],
        code: `async function command(ctx) {
  for (const id of ctx.input.recordIds) await ctx.api.update("Bug", id, { new_stav: "hotovo" });
  return { message: "Označeno " + ctx.input.recordIds.length };
}`,
      },
    },
    {
      type: "script",
      entity: "Bug",
      key: "formular",
      definition: {
        code: `async function onLoad(ctx) {
  ctx.form.setNotification("Ahoj ze skriptu", "info");
  if (!ctx.recordId) ctx.form.setValue("new_stav", "nový");
}
async function onChange(ctx) {
  ctx.form.setValue("new_stav", "upraveno: " + ctx.form.getValue("name"));
}
async function zkusSit(ctx) {
  try { await fetch("https://example.com"); ctx.ui.alert("SÍŤ DOSTUPNÁ"); }
  catch (e) { ctx.ui.alert("síť blokovaná"); }
}`,
      },
    },
    {
      type: "form",
      entity: "Bug",
      key: "main",
      definition: {
        events: {
          onLoad: [{ script: "formular", function: "onLoad" }],
          onChange: { name: [{ script: "formular", function: "onChange" }] },
        },
      },
    },
    { type: "command", entity: "Bug", key: "sit", definition: { label: "Test sítě", location: "form", action: { type: "script", script: "formular", function: "zkusSit" } } },
    { type: "command", entity: "Bug", key: "oznacit_hotove", definition: { label: "Označit hotové", location: "list", action: { type: "plugin", plugin: "oznacit" } } },
  ]);

  const context = await browser.newContext({ storageState: user.storageState });
  const page = await context.newPage();
  try {
    await page.goto("/bugs/new");
    await expect(page.getByText("Ahoj ze skriptu")).toBeVisible();
    await expect(page.getByLabel("Stav opravy")).toHaveValue("nový");
    await page.getByRole("textbox", { name: /^Název/ }).pressSequentially("Test");
    await expect(page.getByLabel("Stav opravy")).toHaveValue("upraveno: Test");

    // Validace pluginu zastaví uložení a hláška dojde až k uživateli (i přes produkční Next).
    await fillBug(page, "zakázáno tohle");
    await page.getByRole("button", { name: "Nahlásit" }).click();
    await expect(page.getByText("Tenhle název firma nepovoluje")).toBeVisible();

    await fillBug(page, "Povolený bug", "Původní popis");
    await page.getByRole("button", { name: "Nahlásit" }).click();
    await page.waitForURL(/\/bugs\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Popis problému")).toHaveValue("Doplněno pluginem");

    // Klientský skript nemá síť.
    await page.getByRole("button", { name: "Test sítě" }).click();
    await expect(page.getByText("síť blokovaná")).toBeVisible();
    await expect(page.getByText("SÍŤ DOSTUPNÁ")).toHaveCount(0);

    // Tlačítko nad seznamem spustí plugin na vybraných řádcích.
    await page.goto("/bugs");
    await page.getByRole("row", { name: /Povolený bug/ }).getByRole("checkbox").click();
    await page.getByRole("button", { name: "Označit hotové" }).click();
    await expect(page.getByText("Označeno 1")).toBeVisible();
    const { data: bug } = await user.admin
      .from("bugs")
      .select("custom")
      .eq("organization_id", user.orgId)
      .eq("name", "Povolený bug")
      .single();
    expect(bug!.custom).toMatchObject({ new_stav: "hotovo" });

    // console.log z pluginu je v logu.
    await page.goto("/settings/customization/log");
    await expect(page.getByText("plugin běžel beforeCreate").first()).toBeVisible();
  } finally {
    await context.close();
    await user.cleanup();
  }
});

test("a custom entity gets a menu entry, a list and a form", async ({ browser }) => {
  const user = await createUserWithRole("System Customizer", "custentity");
  await seedPublished(user.admin, user.orgId, [
    {
      type: "entity",
      entity: "new_Zakazka",
      key: "new_Zakazka",
      definition: { displayName: "Zakázka", displayNamePlural: "Zakázky", primaryFieldLabel: "Číslo zakázky", icon: "Hammer" },
    },
    { type: "field", entity: "new_Zakazka", key: "new_misto", definition: { label: "Místo stavby", type: "text" } },
  ]);

  const context = await browser.newContext({ storageState: user.storageState });
  const page = await context.newPage();
  try {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Zakázky" }).click();
    await page.waitForURL(/\/c\/new_Zakazka$/);
    await page.getByRole("button", { name: "Nový záznam" }).click();
    await page.getByLabel("Číslo zakázky").fill("ZAK-001");
    await page.getByLabel("Místo stavby").fill("Brno");
    await page.getByRole("button", { name: "Vytvořit" }).click();
    await page.waitForURL(/\/c\/new_Zakazka\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Místo stavby")).toHaveValue("Brno");

    await page.goto("/c/new_Zakazka");
    await expect(page.getByRole("row", { name: /ZAK-001.*Brno/ })).toBeVisible();

    // Neznámá vlastní entita je 404, ne prázdná stránka.
    const response = await page.goto("/c/new_Neexistuje");
    expect(response?.status()).toBe(404);
  } finally {
    await context.close();
    await user.cleanup();
  }
});
