import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function createQuoteWithItem(admin: ReturnType<typeof adminClient>) {
  const { data: org, error: orgErr } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (orgErr) throw orgErr;

  const { data: account, error: accErr } = await admin
    .from("accounts")
    .select("id")
    .eq("organization_id", org.id)
    .limit(1)
    .single();
  if (accErr) throw accErr;

  const { data: project, error: projErr } = await admin
    .from("projects")
    .insert({ organization_id: org.id, account_id: account.id, name: `E2E Invoice Project ${Date.now()}` })
    .select("id")
    .single();
  if (projErr) throw projErr;

  const { data: quote, error: quoteErr } = await admin
    .from("quotes")
    .insert({ organization_id: org.id, project_id: project.id, account_id: account.id, name: `E2E Invoice Quote ${Date.now()}` })
    .select("id")
    .single();
  if (quoteErr) throw quoteErr;

  const { error: itemErr } = await admin
    .from("quote_items")
    .insert({ organization_id: org.id, quote_id: quote.id, name: "Projekční práce", quantity: 2, unit: "hod", unit_price: 1500 });
  if (itemErr) throw itemErr;

  return { admin, orgId: org.id as string, projectId: project.id as string, quoteId: quote.id as string };
}

test("generating an invoice from a quote copies items/totals, and the number can be manually overridden", async ({
  page,
}) => {
  const { admin, projectId, quoteId } = await createQuoteWithItem(adminClient());

  await page.goto(`/quotes/${quoteId}`);
  await page.getByRole("button", { name: "Vygenerovat fakturu" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);

  // items and totals carried over from the quote (2 * 1500 = 3000, 21% VAT -> 3630 total)
  await expect(page.getByText("Projekční práce")).toBeVisible();
  await expect(page.getByText("3 630,00 Kč").first()).toBeVisible();

  // number follows FAK-<year>-#### and is manually overridable
  const numberInput = page.getByLabel(/Číslo faktury/i);
  await expect(numberInput).toHaveValue(/^FAK-\d{4}-\d{4}$/);

  const customNumber = `RUCNI-${Date.now()}`;
  await numberInput.fill(customNumber);
  await page.getByRole("button", { name: /^Uložit změny/ }).first().click();
  await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByLabel(/Číslo faktury/i)).toHaveValue(customNumber);

  const invoiceId = page.url().split("/").pop()!;

  // mark as paid, then undo, confirming the toggle persists both ways
  await page.getByRole("button", { name: "Označit jako uhrazenou" }).click();
  await expect(page.getByRole("button", { name: "Zrušit uhrazení" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Uhrazeno", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Zrušit uhrazení" }).click();
  await expect(page.getByRole("button", { name: "Označit jako uhrazenou" })).toBeVisible({ timeout: 10_000 });

  // PDF without a bank account configured — still a valid PDF, no crash
  const pdfNoQr = await page.request.get(`/api/invoices/${invoiceId}/pdf`);
  expect(pdfNoQr.status()).toBe(200);
  expect(pdfNoQr.headers()["content-type"]).toBe("application/pdf");
  expect((await pdfNoQr.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // PDF with a bank account configured — should be a (bigger) valid PDF with the QR embedded
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  await admin.from("organizations").update({ bank_account: "19-2000145399/0800" }).eq("id", org!.id);

  const pdfWithQr = await page.request.get(`/api/invoices/${invoiceId}/pdf`);
  expect(pdfWithQr.status()).toBe(200);
  const bodyWithQr = await pdfWithQr.body();
  expect(bodyWithQr.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bodyWithQr.length).toBeGreaterThan((await pdfNoQr.body()).length);

  // cleanup
  await admin.from("organizations").update({ bank_account: null }).eq("id", org!.id);
  await admin.from("invoices").delete().eq("id", invoiceId);
  await admin.from("quotes").delete().eq("id", quoteId);
  await admin.from("projects").delete().eq("id", projectId);
});
