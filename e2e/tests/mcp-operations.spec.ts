import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createUserWithRole } from "../lib/roleUser";

/**
 * Plný povrch MCP: obecné CRUD nad entitami, operace (kvalifikace, položky, úhrada, tým,
 * upozornění, šablony, číselníky), úpravy firmy (publikace/vrácení) a hlavně pojistky:
 * AI nesmaže ani nevystaví fakturu sama — jen připraví odkaz, který potvrdí člověk ve webu.
 */

type McpUser = Awaited<ReturnType<typeof createMcpUser>>;

async function createMcpUser(role: string, prefix: string) {
  const user = await createUserWithRole(role, prefix);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !signIn.session) throw error ?? new Error("sign-in selhalo");
  const token = `pcrm_e2e${user.suffix}${Math.random().toString(36).slice(2)}`;
  await user.admin.from("mcp_tokens").insert({
    user_id: user.userId,
    name: `E2E ${prefix}`,
    token_hash: createHash("sha256").update(token).digest("hex"),
    refresh_token: signIn.session.refresh_token,
  });
  return { ...user, token };
}

/** Zavolá nástroj a vrátí { isError, text, json }. */
async function tool(request: APIRequestContext, user: McpUser, name: string, args: Record<string, unknown> = {}) {
  const res = await request.post("/api/mcp", {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${user.token}`,
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  expect(res.ok(), `${name}: HTTP ${res.status()}`).toBe(true);
  const raw = await res.text();
  const line = raw.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? raw;
  const result = JSON.parse(line).result as { isError?: boolean; content: { text: string }[] };
  const text = result.content[0]?.text ?? "";
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* chybové hlášky jsou prostý text */
  }
  return { isError: Boolean(result.isError), text, json: json as Record<string, unknown> & unknown[] };
}

async function ok(request: APIRequestContext, user: McpUser, name: string, args: Record<string, unknown> = {}) {
  const result = await tool(request, user, name, args);
  expect(result.isError, `${name} selhal: ${result.text}`).toBe(false);
  return result.json;
}

const pathOf = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

test.describe.configure({ mode: "serial" });

test("generic CRUD, operations and human-confirmed delete and invoice", async ({ request, browser }) => {
  test.setTimeout(180_000);
  const user = await createMcpUser("Basic User", "mcpops");
  const other = await createMcpUser("Basic User", "mcpother");
  const s = user.suffix;

  try {
    // --- metadata a validace ---
    const entities = (await ok(request, user, "describe_entity")) as unknown as { entity: string }[];
    expect(entities.map((e) => e.entity)).toEqual(expect.arrayContaining(["Quote", "Invoice", "Bug", "Activity"]));
    const quoteMeta = await ok(request, user, "describe_entity", { entity: "Quote" });
    expect(JSON.stringify(quoteMeta)).toContain("project_id");

    const bad = await tool(request, user, "create_record", {
      entity: "Account",
      values: { name: "X", organization_id: other.orgId },
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("organization_id");
    expect((await tool(request, user, "create_record", { entity: "Nic", values: {} })).isError).toBe(true);

    // --- zájemce → kvalifikace na firmu + kontakt + projekt ---
    const lead = (await ok(request, user, "create_record", {
      entity: "Lead",
      values: { name: `Vila ${s}`, email: `vila${s}@example.com` },
    })).vytvoreno as { id: string };
    const qualified = (await ok(request, user, "qualify_lead", { lead_id: lead.id, create_project: true })).vytvoreno as {
      accountId: string;
      contactId: string;
      projectId: string;
    };
    expect(qualified.projectId).toBeTruthy();

    // --- update s číselníkem podle názvu + before/after ---
    const stages = JSON.stringify(await ok(request, user, "describe_entity", { entity: "Project" }));
    const stageLabel = (JSON.parse(stages).pole as { name: string; hodnoty?: string[] }[]).find((f) => f.name === "status_reason_id")!
      .hodnoty![1];
    const updated = await ok(request, user, "update_record", {
      entity: "Project",
      id: qualified.projectId,
      values: { status_reason_id: stageLabel, description: "Přes MCP" },
    });
    expect(JSON.stringify(updated.po_zmene)).toContain(stageLabel);
    expect((await ok(request, user, "get_record", { entity: "Project", id: qualified.projectId })).description).toBe("Přes MCP");

    // --- nabídka s položkami ---
    const quote = (await ok(request, user, "create_record", {
      entity: "Quote",
      values: { name: `Nabídka ${s}`, project_id: qualified.projectId, contact_id: qualified.contactId },
    })).vytvoreno as { id: string };
    const item1 = (await ok(request, user, "add_quote_item", { quote_id: quote.id, name: "Studie", unit_price: 10000 }))
      .vytvoreno as { id: string };
    await ok(request, user, "add_quote_item", { quote_id: quote.id, name: "DSP", quantity: 2, unit_price: 5000 });
    const changed = await ok(request, user, "update_quote_item", { item_id: item1.id, unit_price: 12000 });
    expect((changed.po_zmene as { unit_price: number }).unit_price).toBe(12000);
    expect((await ok(request, user, "list_quote_items", { quote_id: quote.id })) as unknown[]).toHaveLength(2);

    // --- faktura: AI jen připraví, vystaví člověk ---
    const prepared = await ok(request, user, "request_invoice_from_quote", { quote_id: quote.id });
    expect(prepared.celkem_bez_dph).toBe(22000);
    const { count: before } = await user.admin.from("invoices").select("id", { count: "exact", head: true }).eq("quote_id", quote.id);
    expect(before).toBe(0);

    const context = await browser.newContext({ storageState: user.storageState });
    const page = await context.newPage();
    await page.goto(pathOf(String(prepared.potvrzeni)));
    await expect(page.getByText("Celkem bez DPH")).toBeVisible();
    await page.getByRole("button", { name: "Vystavit fakturu" }).click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
    const invoiceId = page.url().split("/").pop()!;

    // --- úhrada a položky faktury ---
    const paid = await ok(request, user, "set_invoice_paid", { invoice_id: invoiceId, paid: true, paid_on: "2026-11-18" });
    expect(paid.po_zmene).toMatchObject({ uhrazeno: true, datum_uhrady: "2026-11-18" });
    const invItem = (await ok(request, user, "add_invoice_item", { invoice_id: invoiceId, name: "Vícepráce", unit_price: 1500 }))
      .vytvoreno as { id: string };
    await ok(request, user, "update_invoice_item", { item_id: invItem.id, quantity: 3 });

    // --- mazání: AI jen připraví, odkaz z jiného stavu neplatí, smaže až klik ---
    const delItem = await ok(request, user, "request_delete", { entity: "QuoteItem", id: item1.id });
    expect((await user.admin.from("quote_items").select("id").eq("id", item1.id)).data).toHaveLength(1);
    await ok(request, user, "update_quote_item", { item_id: item1.id, name: "Studie upravená" });
    await page.goto(pathOf(String(delItem.potvrzeni)));
    await expect(page.getByText("Záznam se od přípravy změnil")).toBeVisible();
    await page.getByRole("button", { name: "Smazat" }).click();
    await page.waitForURL(new RegExp(`/quotes/${quote.id}$`));
    expect((await user.admin.from("quote_items").select("id").eq("id", item1.id)).data).toHaveLength(0);

    // Nabídka po fázích (create_quote): faktura nese všechny fáze — přehled musí sedět s tím, co vystaví RPC.
    const phased = await ok(request, user, "create_quote", {
      project_id: qualified.projectId,
      nazev_stavby: `Stavba ${s}`,
      phases: [
        { nazev: "Studie", cena: 30000 },
        { nazev: "DSP", cena: 70000 },
      ],
    });
    const phasedId = String((phased.nabidka as { id?: string } | undefined)?.id ?? (phased as { id?: string }).id ?? "");
    const { data: phasedRow } = await user.admin.from("quotes").select("id").eq("organization_id", user.orgId).ilike("nazev_stavby", `Stavba ${s}`).maybeSingle();
    const phasedQuoteId = phasedId || phasedRow!.id;
    const phasedInvoice = await ok(request, user, "request_invoice_from_quote", { quote_id: phasedQuoteId });
    expect(phasedInvoice.celkem_bez_dph).toBe(100000);
    expect(JSON.stringify(phasedInvoice.polozky)).toContain("DSP");
    const phase = (await user.admin.from("quote_phases").select("id").eq("quote_id", phasedQuoteId).limit(1)).data![0];
    expect(String((await ok(request, user, "request_delete", { entity: "QuotePhase", id: phase.id })).potvrzeni)).toContain(
      "/potvrdit-smazani?",
    );

    const projectPreview = await ok(request, user, "request_delete", { entity: "Project", id: qualified.projectId });
    expect(JSON.stringify(projectPreview.spolu_s)).toContain("Faktury");
    expect(projectPreview.varovani).toContain("faktura");

    // --- cizí organizace: nic nevidí ---
    expect((await tool(request, other, "request_delete", { entity: "Project", id: qualified.projectId })).isError).toBe(true);
    expect((await tool(request, other, "get_record", { entity: "Project", id: qualified.projectId })).isError).toBe(true);
    expect(
      (await tool(request, other, "update_record", { entity: "Quote", id: quote.id, values: { name: "hack" } })).isError,
    ).toBe(true);
    await page.close();
    const otherContext = await browser.newContext({ storageState: other.storageState });
    const otherPage = await otherContext.newPage();
    await otherPage.goto(pathOf(String(projectPreview.potvrzeni)));
    await expect(otherPage.getByText("Záznam neexistuje nebo k němu nemáš přístup.")).toBeVisible();
    await otherContext.close();
    await context.close();

    // --- tým, milníky, upozornění, šablony, číselníky, bug, notifikace ---
    const milestone = await ok(request, user, "create_milestone", { project_id: qualified.projectId, name: "Podání DSP" });
    const milestoneId = ((milestone.vytvoreno ?? milestone) as { id: string }).id;
    await ok(request, user, "set_milestone_notification", { milestone_id: milestoneId, type: "PUSH", days_before: 3 });
    const contact2 = (await ok(request, user, "create_record", { entity: "Contact", values: { first_name: "Statik", last_name: `${s}` } }))
      .vytvoreno as { id: string };
    await ok(request, user, "add_project_member", { project_id: qualified.projectId, contact_id: contact2.id });
    const template = (await ok(request, user, "create_record", { entity: "ProjectTemplate", values: { name: `Šablona ${s}` } }))
      .vytvoreno as { id: string };
    await ok(request, user, "add_template_milestone", { template_id: template.id, name: "Studie", offset_days: 14 });
    const value = (await ok(request, user, "add_option_set_value", { option_set_key: "profese", label: `Geodet ${s}` }))
      .vytvoreno as { id: string };
    await ok(request, user, "set_option_set_value_active", { value_id: value.id, active: false });
    await ok(request, user, "create_record", { entity: "Bug", values: { name: `Bug ${s}`, description: "Z MCP" } });
    const bugs = await ok(request, user, "list_records", { entity: "Bug", search: `${s}` });
    expect(bugs.zaznamy).toHaveLength(1);
    expect(bugs.dalsi_stranka).toBeUndefined();
    await ok(request, user, "mark_notifications_read");
    for (const sub of ["ProjectMilestone", "ProjectMember", "TemplateMilestone"]) {
      const table = { ProjectMilestone: "project_milestones", ProjectMember: "project_contacts", TemplateMilestone: "template_milestones" }[sub]!;
      const { data } = await user.admin.from(table).select("id").eq("organization_id", user.orgId).limit(1);
      const preview = await ok(request, user, "request_delete", { entity: sub, id: data![0].id });
      expect(String(preview.potvrzeni)).toContain("/potvrdit-smazani?");
    }
  } finally {
    await user.cleanup();
    await other.cleanup();
  }
});

test("customizations: a customizer can publish and revert via MCP, a basic user cannot", async ({ request }) => {
  test.setTimeout(120_000);
  const customizer = await createMcpUser("System Customizer", "mcpcust");
  const basic = await createMcpUser("Basic User", "mcpbasic");
  const key = `new_cislo${customizer.suffix % 100000}`;

  try {
    await ok(request, customizer, "save_customization_draft", {
      type: "field",
      entity: "Project",
      key,
      definition: { label: "Číslo zakázky", type: "text" },
    });
    const preview = (await ok(request, customizer, "preview_customization_changes")) as unknown as { key: string; stav: string }[];
    expect(preview).toEqual([expect.objectContaining({ key, stav: "new" })]);
    expect((await ok(request, customizer, "publish_customizations", { message: "Číslo zakázky" })).publikace).toBe(1);

    // Pole je hned použitelné přes obecné CRUD.
    const project = (await ok(request, customizer, "create_record", {
      entity: "Contact",
      values: { first_name: "Klient" },
    })).vytvoreno as { id: string };
    const created = (await ok(request, customizer, "create_record", {
      entity: "Project",
      values: { name: "Se zakázkou", primary_contact_id: project.id, [key]: "Z-42" },
    })).vytvoreno as Record<string, unknown>;
    expect(created[key]).toBe("Z-42");

    const history = (await ok(request, customizer, "list_customization_publishes")) as unknown as { id: string }[];
    await ok(request, customizer, "revert_customization_publish", { publish_id: history[0].id });
    await ok(request, customizer, "publish_customizations", { message: "Zpět" });
    expect((await ok(request, customizer, "list_customizations")) as unknown[]).toHaveLength(0);

    const denied = await tool(request, basic, "publish_customizations", { message: "x" });
    const deniedDraft = await tool(request, basic, "save_customization_draft", {
      type: "field",
      entity: "Project",
      key: "new_x",
      definition: { label: "X", type: "text" },
    });
    expect(deniedDraft.isError).toBe(true);
    expect(deniedDraft.text).toContain("System Customizer");
    // Bez rozpracovaných změn publikace nic neudělá, ale nesmí projít jako úspěch se změnou.
    expect(denied.isError || (denied.json as { publikace?: number })?.publikace === 0 || denied.json === null).toBe(true);
  } finally {
    await customizer.cleanup();
    await basic.cleanup();
  }
});

test("tools carry annotations and the server sends usage instructions", async ({ request }) => {
  const user = await createMcpUser("Basic User", "mcpmeta");
  try {
    const call = async (method: string, params: Record<string, unknown> = {}) => {
      const res = await request.post("/api/mcp", {
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${user.token}` },
        data: { jsonrpc: "2.0", id: 1, method, params },
      });
      const raw = await res.text();
      return JSON.parse(raw.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? raw).result;
    };
    const init = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    });
    expect(init.instructions).toContain("request_delete");

    const { tools } = (await call("tools/list")) as { tools: { name: string; annotations?: Record<string, boolean> }[] };
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]));
    expect(tools.every((t) => t.annotations?.openWorldHint === false)).toBe(true);
    expect(byName.request_delete).toMatchObject({ readOnlyHint: true });
    expect(byName.list_records).toMatchObject({ readOnlyHint: true });
    expect(byName.create_record).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.update_record).toMatchObject({ destructiveHint: true });
    expect(byName.publish_customizations).toMatchObject({ destructiveHint: true });
  } finally {
    await user.cleanup();
  }
});
