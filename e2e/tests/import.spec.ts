import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

async function deletePreviousImports() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  await admin.from("leads").delete().ilike("name", "E2E Import Lead%");
}

function writeXlsx(rows: Record<string, unknown>[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-import-"));
  const filePath = path.join(dir, "leads.xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Data");
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function goToMapStep(page: import("@playwright/test").Page, filePath: string) {
  await page.goto("/import?entity=Lead");
  await expect(page.getByText(/1\. Entita/)).toBeVisible();
  await page.getByRole("button", { name: /Pokračovat/i }).click();
  await expect(page.getByText(/2\. Soubor/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.getByText(/3\. Mapování/)).toBeVisible();
}

test("Excel import: auto-maps columns by label and imports valid rows", async ({ page }) => {
  await deletePreviousImports();
  const filePath = writeXlsx([
    { Jméno: "E2E Import Lead 1", Firma: "Import Test s.r.o.", "Očekávaná hodnota": 100000 },
    { Jméno: "E2E Import Lead 2", Firma: "Import Test s.r.o.", "Očekávaná hodnota": 50000 },
  ]);
  await goToMapStep(page, filePath);

  // auto-mapping should have matched the "Jméno" column header to the "name" field by its label
  const jmenoRow = page.locator("div.flex.items-center.gap-3", { hasText: "Jméno" });
  await expect(jmenoRow.getByRole("combobox")).toContainText("Jméno");

  await page.getByRole("button", { name: /Zkontrolovat řádky/i }).click();
  await expect(page.getByText(/^2 \/ 2 řádků v pořádku$/)).toBeVisible();

  const importButton = page.getByRole("button", { name: /Importovat/i });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(page.getByText(/Naimportováno 2 záznamů\./)).toBeVisible();

  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "E2E Import Lead 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Import Lead 2" })).toBeVisible();
});

test("Excel import: a missing required cell blocks import with a friendly message, not a raw Zod error", async ({
  page,
}) => {
  const filePath = writeXlsx([
    { Jméno: "", Firma: "Chybí jméno — má selhat validaci", "Očekávaná hodnota": 5000 },
  ]);
  await goToMapStep(page, filePath);

  await page.getByRole("button", { name: /Zkontrolovat řádky/i }).click();
  await expect(page.getByText(/^0 \/ 1 řádků v pořádku$/)).toBeVisible();
  await expect(page.getByText(/^Povinné pole$/)).toBeVisible();
  await expect(page.getByText(/expected string, received undefined/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Importovat/i })).toBeDisabled();
});
