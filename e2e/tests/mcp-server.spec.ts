import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

/**
 * Vzdálený MCP server (/api/mcp) — připojuje se do AI klientů osobním tokenem.
 *
 * Těžiště testu je bezpečnost: token jedná jménem konkrétního uživatele a veškerá izolace
 * organizací musí držet na RLS, ne na tom, že jsou nástroje "napsané správně". Proto se tu
 * cíleně zkouší sáhnout na data CIZÍ organizace.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Založí uživatele ve vlastní organizaci a vyrobí mu MCP token (stejně jako to dělá UI). */
async function createUserWithMcpToken(prefix: string) {
  const admin = adminClient();
  const suffix = Date.now() + Math.floor(Math.random() * 1000);
  const email = `e2e-mcp-${prefix}-${suffix}@projektant-crm.test`;
  const password = "E2eMcp!Passw0rd";

  const { data: org } = await admin
    .from("organizations")
    .insert({ name: `E2E MCP Org ${prefix} ${suffix}` })
    .select("id")
    .single();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from("users").insert({
    user_id: created.user.id,
    organization_id: org!.id,
    email,
    first_name: prefix,
  });

  // Refresh token získáme přihlášením — UI ho bere ze session přihlášeného uživatele.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session) throw signInError ?? new Error("sign-in selhalo");

  const token = `pcrm_e2e${suffix}${Math.random().toString(36).slice(2)}`;
  await admin.from("mcp_tokens").insert({
    user_id: created.user.id,
    name: `E2E ${prefix}`,
    token_hash: createHash("sha256").update(token).digest("hex"),
    refresh_token: signIn.session.refresh_token,
  });

  return { admin, token, userId: created.user.id, orgId: org!.id as string, suffix };
}

/** Jedno JSON-RPC volání na MCP endpoint. */
async function mcpCall(
  request: import("@playwright/test").APIRequestContext,
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
) {
  const res = await request.post("/api/mcp", {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  return res;
}

test("rejects requests with no token and with a bogus token", async ({ request }) => {
  const noToken = await mcpCall(request, null, "tools/list");
  expect(noToken.status()).toBe(401);

  const bogus = await mcpCall(request, "pcrm_nonsense_token_value", "tools/list");
  expect(bogus.status()).toBe(401);
});

test("a valid token can list tools and read its own organization's data", async ({ request }) => {
  const { admin, token, userId, orgId, suffix } = await createUserWithMcpToken("own");
  await admin.from("leads").insert({ organization_id: orgId, name: `E2E MCP Lead ${suffix}` });

  try {
    const list = await mcpCall(request, token, "tools/list");
    expect(list.ok()).toBe(true);
    const listBody = await list.text();
    expect(listBody).toContain("search_crm");
    expect(listBody).toContain("list_leads");

    const call = await mcpCall(request, token, "tools/call", {
      name: "list_leads",
      arguments: { only_active: true, limit: 20 },
    });
    expect(call.ok()).toBe(true);
    expect(await call.text()).toContain(`E2E MCP Lead ${suffix}`);
  } finally {
    await admin.from("leads").delete().eq("organization_id", orgId);
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
});

test("a token cannot reach another organization's data — RLS holds through MCP", async ({ request }) => {
  const alice = await createUserWithMcpToken("alice");
  const bob = await createUserWithMcpToken("bob");

  const secretName = `E2E MCP Bobs Secret Lead ${bob.suffix}`;
  await bob.admin.from("leads").insert({ organization_id: bob.orgId, name: secretName });

  try {
    // Alicin token se pokusí Bobova data najít rovnou třemi cestami.
    const viaList = await mcpCall(request, alice.token, "tools/call", {
      name: "list_leads",
      arguments: { only_active: false, limit: 50 },
    });
    expect(await viaList.text()).not.toContain(secretName);

    const viaSearch = await mcpCall(request, alice.token, "tools/call", {
      name: "search_crm",
      arguments: { query: "Bobs Secret" },
    });
    expect(await viaSearch.text()).not.toContain(secretName);

    const viaContacts = await mcpCall(request, alice.token, "tools/call", {
      name: "find_contact",
      arguments: { query: "Bobs Secret" },
    });
    expect(await viaContacts.text()).not.toContain(secretName);
  } finally {
    await bob.admin.from("leads").delete().eq("organization_id", bob.orgId);
    for (const u of [alice, bob]) {
      await u.admin.auth.admin.deleteUser(u.userId);
      await u.admin.from("organizations").delete().eq("id", u.orgId);
    }
  }
});

test("writes land in the caller's own organization, and there is no delete tool at all", async ({ request }) => {
  const { admin, token, userId, orgId, suffix } = await createUserWithMcpToken("write");

  try {
    const list = await mcpCall(request, token, "tools/list");
    const toolsBody = await list.text();
    // Zápisová plocha je schválně úzká — mazání ani hromadné změny se nesmí objevit.
    expect(toolsBody).not.toContain("delete");
    expect(toolsBody).toContain("create_lead");

    const created = await mcpCall(request, token, "tools/call", {
      name: "create_lead",
      arguments: { name: `E2E MCP Created ${suffix}`, company_name: "Test s.r.o." },
    });
    expect(created.ok()).toBe(true);

    const { data: rows } = await admin
      .from("leads")
      .select("name, organization_id")
      .eq("organization_id", orgId);
    expect(rows?.some((r) => r.name === `E2E MCP Created ${suffix}`)).toBe(true);
  } finally {
    await admin.from("leads").delete().eq("organization_id", orgId);
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
});

test("generating a token through the settings UI produces a working token", async ({ page, request }) => {
  await page.goto("/settings/mcp");
  await expect(page.getByRole("heading", { name: "MCP - AI" })).toBeVisible();

  await page.getByLabel("Název tokenu").fill(`E2E UI token ${Date.now()}`);
  await page.getByRole("button", { name: "Vygenerovat token" }).click();

  // Token se ukazuje jen jednou, přímo v dialogu — vytáhneme ho a rovnou zkusíme použít.
  const tokenCode = page.locator("pre").filter({ hasText: /^pcrm_/ });
  await expect(tokenCode).toBeVisible();
  const token = ((await tokenCode.textContent()) ?? "").trim();
  expect(token.startsWith("pcrm_")).toBe(true);

  const call = await mcpCall(request, token, "tools/list");
  expect(call.ok()).toBe(true);
  expect(await call.text()).toContain("search_crm");

  // Úklid: odvolat vygenerovaný token, ať se v nastavení nehromadí.
  await page.getByRole("button", { name: "Hotovo, zkopírováno" }).click();
  await page.getByRole("button", { name: "Odvolat" }).first().click();
  await page.getByRole("button", { name: "Ano, odvolat" }).click();
});

/** Založí klienta, projekt a jeden nesplněný milník — materiál pro update nástroje. */
async function seedProject(admin: ReturnType<typeof adminClient>, orgId: string, suffix: number | string) {
  const { data: account } = await admin
    .from("accounts")
    .insert({ organization_id: orgId, name: `E2E MCP Klient ${suffix}` })
    .select("id")
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: orgId, account_id: account!.id, name: `E2E MCP Projekt ${suffix}` })
    .select("id")
    .single();
  const { data: milestone } = await admin
    .from("project_milestones")
    .insert({
      organization_id: orgId,
      project_id: project!.id,
      name: `E2E MCP Milnik ${suffix}`,
      termin_splneni: "2027-01-31",
    })
    .select("id")
    .single();
  return { projectId: project!.id as string, milestoneId: milestone!.id as string };
}

test("update tools move the project stage and tick off a milestone", async ({ request }) => {
  const { admin, token, userId, orgId, suffix } = await createUserWithMcpToken("upd");
  const { projectId, milestoneId } = await seedProject(admin, orgId, suffix);

  try {
    // Fáze se zadává lidským názvem — a schválně bez diakritiky, přesně jak ji model napíše.
    const staged = await mcpCall(request, token, "tools/call", {
      name: "update_project",
      arguments: { project_id: projectId, stage: "smlouva podepsana", budget: 250000 },
    });
    const stagedBody = await staged.text();
    // Odpověď musí nést stav před i po, aby uživatel v chatu viděl, co se přepsalo.
    expect(stagedBody).toContain("pred_zmenou");
    expect(stagedBody).toContain("Smlouva podepsán");

    const { data: projectRow } = await admin
      .from("projects")
      .select("budget, option_set_values!projects_status_reason_id_fkey(value_key)")
      .eq("id", projectId)
      .single();
    expect(Number(projectRow!.budget)).toBe(250000);
    expect(
      (projectRow as unknown as { option_set_values: { value_key: string } }).option_set_values.value_key,
    ).toBe("smlouva_podepsana");

    // Čtecí nástroje musí fázi ukázat lidsky (ne jako UUID) a vracet id milníku — tím ho
    // teprve jde adresovat v update_milestone, takže ta dvojice se testuje pohromadě.
    const listed = await mcpCall(request, token, "tools/call", {
      name: "list_projects",
      arguments: { only_active: true, limit: 50 },
    });
    const listedBody = await listed.text();
    expect(listedBody).toContain(`E2E MCP Projekt ${suffix}`);
    expect(listedBody).toContain("faze");
    expect(listedBody).not.toContain("status_reason_id");

    const detail = await mcpCall(request, token, "tools/call", {
      name: "get_project_detail",
      arguments: { project_id: projectId },
    });
    const detailBody = await detail.text();
    expect(detailBody).toContain(milestoneId);
    expect(detailBody).toContain("Smlouva podepsán");

    // Neznámou fázi nástroj nesmí tiše spolknout — musí vrátit seznam platných.
    const bogus = await mcpCall(request, token, "tools/call", {
      name: "update_project",
      arguments: { project_id: projectId, stage: "Vyfakturovano a zaplaceno" },
    });
    const bogusBody = await bogus.text();
    expect(bogusBody).toContain("Realizace");
    expect(bogusBody).toContain("Dokon");

    const done = await mcpCall(request, token, "tools/call", {
      name: "update_milestone",
      arguments: { milestone_id: milestoneId, done: true },
    });
    expect(done.ok()).toBe(true);
    const { data: milestoneRow } = await admin
      .from("project_milestones")
      .select("splneno")
      .eq("id", milestoneId)
      .single();
    expect(milestoneRow!.splneno).toBe(true);
  } finally {
    await admin.from("projects").delete().eq("organization_id", orgId);
    await admin.from("accounts").delete().eq("organization_id", orgId);
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
});

test("an update cannot reach another organization — the foreign record stays untouched", async ({ request }) => {
  const alice = await createUserWithMcpToken("updalice");
  const bob = await createUserWithMcpToken("updbob");
  const bobs = await seedProject(bob.admin, bob.orgId, bob.suffix);

  try {
    const attempt = await mcpCall(request, alice.token, "tools/call", {
      name: "update_project",
      arguments: { project_id: bobs.projectId, name: "PREPSANO ALICI", budget: 1 },
    });
    expect(await attempt.text()).toContain("nenalezen");

    // Podstatná část: RLS to nesmí jen "neukázat", ale ani nepřepsat.
    const { data: after } = await bob.admin
      .from("projects")
      .select("name, budget")
      .eq("id", bobs.projectId)
      .single();
    expect(after!.name).toBe(`E2E MCP Projekt ${bob.suffix}`);
    expect(after!.budget).toBeNull();
  } finally {
    for (const u of [alice, bob]) {
      await u.admin.from("projects").delete().eq("organization_id", u.orgId);
      await u.admin.from("accounts").delete().eq("organization_id", u.orgId);
      await u.admin.auth.admin.deleteUser(u.userId);
      await u.admin.from("organizations").delete().eq("id", u.orgId);
    }
  }
});
