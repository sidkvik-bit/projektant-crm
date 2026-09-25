import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

/**
 * Sloupec Klient napříč appkou — po přechodu z firmy na kontakt.
 *
 * Tyhle cesty se rozbijí TIŠE: export a PDF skládají dotaz z názvu cizího klíče, takže špatný
 * název projde přes tsc, eslint i unit testy a selže až za běhu. Kanban a přehled projektů navíc
 * chybu polykají přes `?? []`, takže by se jen zobrazila prázdná tabule a všechno by vypadalo
 * v pořádku. Proto se tu kontroluje obsah, ne jen že se stránka načetla.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Stáhne export a vrátí hlavičky a první datový řádek. */
async function downloadSheet(page: import("@playwright/test").Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportovat do Excelu" }).click(),
  ]);
  const path = await download.path();
  const wb = XLSX.readFile(path);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  return { filename: download.suggestedFilename(), rows };
}

test("the project grid, kanban and overview all show the client — not an empty column", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("organization_id", org!.id)
    .limit(1)
    .single();
  // Fáze je nutná — kanban vykresluje jen projekty, které do nějakého sloupce patří.
  const { data: stage } = await admin
    .from("option_set_values")
    .select("id, option_sets!inner(key, organization_id)")
    .eq("option_sets.key", "project_status_reason")
    .eq("option_sets.organization_id", org!.id)
    .limit(1)
    .single();
  const projectName = `E2E Klient Sloupec ${suffix}`;
  const { data: project } = await admin
    .from("projects")
    .insert({
      organization_id: org!.id,
      primary_contact_id: contact!.id,
      status_reason_id: stage!.id,
      name: projectName,
    })
    .select("id")
    .single();
  // Přehled vypisuje jen projekty "bez pohybu" — počítá se podle poslední aktivity. created_at
  // vynucuje trigger a zpětně ho nastavit nejde, takže se stáří dodá starou aktivitou.
  await admin.from("activities").insert({
    organization_id: org!.id,
    entity_type: "Project",
    entity_id: project!.id,
    subject: `E2E Stará aktivita ${suffix}`,
    activity_date: "2026-01-01T00:00:00Z",
  });
  const clientName = [contact!.first_name, contact!.last_name].filter(Boolean).join(" ");

  try {
    await page.goto("/projects");
    await page.getByPlaceholder(/Hledat v poli/i).fill(projectName);
    await page.getByPlaceholder(/Hledat v poli/i).press("Enter");
    await expect(page.locator("table tbody tr", { hasText: projectName })).toContainText(clientName);

    // Kdyby se vnořený dotaz rozbil, tabule by byla prázdná a stránka by se tvářila v pořádku —
    // kanban chybu polyká přes `?? []`.
    await page.goto("/kanban");
    // Jméno klienta je na kartě vedle odkazu, ne uvnitř něj — proto se cílí na rodiče.
    const card = page.locator("div").filter({ has: page.getByRole("link", { name: projectName }) }).last();
    await expect(card).toContainText(projectName);
    await expect(card).toContainText(clientName);

    await page.goto("/project-overview");
    await expect(page.getByRole("heading", { name: /Přehled projektů/i })).toBeVisible();
    const stalledCard = page.locator("a", { hasText: projectName });
    await expect(stalledCard).toBeVisible();
    await expect(stalledCard).toContainText(clientName);
  } finally {
    await admin.from("activities").delete().eq("entity_id", project!.id);
    await admin.from("projects").delete().eq("id", project!.id);
  }
});

test("exporting projects, quotes and invoices carries the client through", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("organization_id", org!.id)
    .limit(1)
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org!.id, primary_contact_id: contact!.id, name: `E2E Export Projekt ${suffix}` })
    .select("id")
    .single();
  const { data: quote } = await admin
    .from("quotes")
    .insert({
      organization_id: org!.id,
      project_id: project!.id,
      contact_id: contact!.id,
      name: `E2E Export Nabidka ${suffix}`,
    })
    .select("id")
    .single();
  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      organization_id: org!.id,
      project_id: project!.id,
      contact_id: contact!.id,
      name: `E2E Export Faktura ${suffix}`,
    })
    .select("id")
    .single();

  const clientName = [contact!.first_name, contact!.last_name].filter(Boolean).join(" ");

  try {
    for (const { path, column } of [
      { path: "/projects", column: "Klient" },
      { path: "/quotes", column: "Objednatel" },
      { path: "/invoices", column: "Odběratel" },
    ]) {
      await page.goto(path);
      const { rows } = await downloadSheet(page);
      expect(rows.length, `${path}: export nemá žádné řádky`).toBeGreaterThan(0);
      expect(Object.keys(rows[0]), `${path}: chybí sloupec ${column}`).toContain(column);
      // Podstatné je, že hodnota není prázdná — rozbitý vnořený dotaz by dal sloupec bez obsahu.
      expect(rows.some((r) => String(r[column] ?? "").includes(clientName)), `${path}: klient chybí`).toBe(true);
    }
  } finally {
    await admin.from("invoices").delete().eq("id", invoice!.id);
    await admin.from("quotes").delete().eq("id", quote!.id);
    await admin.from("projects").delete().eq("id", project!.id);
  }
});
