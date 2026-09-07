import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Globální fulltextový search v top baru — src/components/shell/GlobalSearch.tsx,
 * src/lib/supabase (RPC "global_search", viz supabase/migrations/20260913200000_add_global_search.sql).
 * Real Postgres tsvector/GIN fulltext přes 7 tabulek (Lead/Account/Contact/Project/Quote/Invoice/Activity),
 * ne ILIKE — viz project_global_search.md memory pro proč. Tenant-isolation na tuhle RPC funkci
 * se ověřuje zvlášť v tenant-isolation.spec.ts (reálná druhá organizace).
 */

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("typing a query shows matching results across multiple entity types", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto("/dashboard");
  await page.getByPlaceholder(/Hledat v CRM/i).fill("Novák");

  await expect(page.getByRole("option", { name: /Novák Architekti/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Obchodní vztah", { exact: true })).toBeVisible();

  expect(errors, `errors while searching:\n${errors.join("\n")}`).toEqual([]);
});

test("a query under 2 characters shows a hint instead of searching", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByPlaceholder(/Hledat v CRM/i).fill("N");
  await expect(page.getByText("Napiš aspoň 2 znaky…")).toBeVisible();
});

test("a query with no matches shows an empty state, not an error", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByPlaceholder(/Hledat v CRM/i).fill("xyznonexistentquery123");
  await expect(page.getByText("Nic nenalezeno")).toBeVisible({ timeout: 10_000 });
});

test("selecting a result navigates straight to that record's detail page", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByPlaceholder(/Hledat v CRM/i).fill("Novák Architekti");
  const option = page.getByRole("option", { name: /Novák Architekti/ });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Novák Architekti s.r.o." })).toBeVisible();
});

test("Ctrl+K focuses the search input from anywhere in the app", async ({ page }) => {
  await page.goto("/leads");
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/Hledat v CRM/i)).toBeFocused();
});

test("searching by a distinctive field other than the name (IČO) still finds the record", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  const uniqueIco = `E2E${Date.now()}`.slice(0, 12);
  const name = `E2E Search By ICO ${Date.now()}`;
  const { data: account } = await admin
    .from("accounts")
    .insert({ organization_id: org!.id, name, ico: uniqueIco })
    .select("id")
    .single();

  await page.goto("/dashboard");
  await page.getByPlaceholder(/Hledat v CRM/i).fill(uniqueIco);
  await expect(page.getByRole("option", { name: new RegExp(name) })).toBeVisible({ timeout: 10_000 });

  await admin.from("accounts").delete().eq("id", account!.id);
});
