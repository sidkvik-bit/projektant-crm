import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth autorizační server pro MCP (/oauth/authorize + /api/oauth/*).
 *
 * Existuje kvůli claude.ai, které statický token v hlavičce poslat neumí. Test jde celou cestou,
 * jakou projde skutečný klient: discovery → registrace → souhlas uživatele → výměna kódu za token
 * → volání MCP tím tokenem → obnovení tokenu. Zkratky by tu měly malou cenu, protože přesně mezi
 * těmi kroky se dělají chyby.
 */

const CALLBACK = "http://localhost/callback";

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** Zaregistruje klienta přes RFC 7591 a vrátí jeho client_id. */
async function registerClient(request: import("@playwright/test").APIRequestContext, name: string) {
  const res = await request.post("/api/oauth/register", {
    data: { client_name: name, redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).client_id as string;
}

/** Projde souhlasnou obrazovkou a vytáhne autorizační kód z návratové adresy. */
async function approveAndGetCode(
  page: import("@playwright/test").Page,
  params: { clientId: string; challenge: string; state: string; redirectUri: string },
) {
  // Na návratovou adresu se reálně nenavigujeme — odchytíme ji, ať v URL zůstane kód.
  await page.route("**/callback*", (route) => route.fulfill({ status: 200, body: "ok" }));

  const url = new URL("/oauth/authorize", "http://localhost:3000");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);

  await page.goto(url.toString());
  await expect(page.getByRole("heading", { name: "Povolit přístup do CRM?" })).toBeVisible();
  await page.getByRole("button", { name: "Povolit" }).click();
  await page.waitForURL(/[?&]code=/);
  return new URL(page.url());
}

test("discovery metadata říkají klientovi vše, co potřebuje", async ({ request }) => {
  const as = await request.get("/.well-known/oauth-authorization-server");
  expect(as.ok()).toBe(true);
  const meta = await as.json();
  // Bez S256 a bez auth metody "none" se Claude na CIMD nechytne a spadne zpátky na registraci.
  expect(meta.code_challenge_methods_supported).toContain("S256");
  expect(meta.token_endpoint_auth_methods_supported).toContain("none");
  expect(meta.client_id_metadata_document_supported).toBe(true);
  expect(meta.authorization_endpoint).toContain("/oauth/authorize");
  expect(meta.token_endpoint).toContain("/api/oauth/token");

  const pr = await request.get("/.well-known/oauth-protected-resource");
  expect(pr.ok()).toBe(true);
  const resource = await pr.json();
  expect(resource.resource).toContain("/api/mcp");
  expect(resource.authorization_servers.length).toBeGreaterThan(0);
});

test("celý tok: souhlas → token → volání MCP → obnovení tokenu", async ({ page, request }) => {
  const clientId = await registerClient(request, "E2E OAuth klient");
  const { verifier, challenge } = pkcePair();
  const state = `st-${Date.now()}`;

  const returned = await approveAndGetCode(page, {
    clientId,
    challenge,
    state,
    redirectUri: "http://localhost:3000/callback",
  });
  const code = returned.searchParams.get("code")!;
  // `state` chrání proti podvrženému dokončení přihlášení — musí se vrátit beze změny.
  expect(returned.searchParams.get("state")).toBe(state);
  expect(code).toBeTruthy();

  const tokenRes = await request.post("/api/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: "http://localhost:3000/callback",
      code_verifier: verifier,
    },
  });
  expect(tokenRes.ok()).toBe(true);
  const tokens = await tokenRes.json();
  expect(tokens.token_type).toBe("Bearer");
  // Claude si token cachuje jen v rozmezí 5 minut až 1 den; mimo něj by ho měnil při každém volání.
  expect(tokens.expires_in).toBeGreaterThanOrEqual(300);
  expect(tokens.expires_in).toBeLessThanOrEqual(86400);

  // Vydaný token musí opravdu otevřít MCP — to je celý smysl cvičení.
  const mcp = await request.post("/api/mcp", {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${tokens.access_token}`,
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  });
  expect(mcp.ok()).toBe(true);
  expect(await mcp.text()).toContain("list_projects");

  // Kód je jednorázový — druhý pokus o výměnu nesmí projít.
  const replay = await request.post("/api/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: "http://localhost:3000/callback",
      code_verifier: verifier,
    },
  });
  expect(replay.status()).toBe(400);
  expect((await replay.json()).error).toBe("invalid_grant");

  const refreshed = await request.post("/api/oauth/token", {
    form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId },
  });
  expect(refreshed.ok()).toBe(true);
  const rotated = await refreshed.json();
  expect(rotated.access_token).not.toBe(tokens.access_token);

  // OAuth 2.1 chce u veřejných klientů rotaci: starý refresh token už nesmí fungovat.
  const reuse = await request.post("/api/oauth/token", {
    form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId },
  });
  expect(reuse.status()).toBe(400);
});

test("PKCE drží: kód bez správného verifieru token nevydá", async ({ page, request }) => {
  const clientId = await registerClient(request, "E2E OAuth PKCE");
  const { challenge } = pkcePair();

  const returned = await approveAndGetCode(page, {
    clientId,
    challenge,
    state: "s",
    redirectUri: "http://localhost:3000/callback",
  });

  const stolen = await request.post("/api/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code: returned.searchParams.get("code")!,
      client_id: clientId,
      redirect_uri: "http://localhost:3000/callback",
      code_verifier: randomBytes(32).toString("base64url"),
    },
  });
  expect(stolen.status()).toBe(400);
  expect((await stolen.json()).error).toBe("invalid_grant");
});

test("neregistrovaná návratová adresa autorizaci zastaví", async ({ page, request }) => {
  const clientId = await registerClient(request, "E2E OAuth redirect");
  const { challenge } = pkcePair();

  const url = new URL("/oauth/authorize", "http://localhost:3000");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", "https://zly-web.example/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  await page.goto(url.toString());
  await expect(page.getByRole("heading", { name: "Nepovolená návratová adresa" })).toBeVisible();
  // Souhlas se nesmí vůbec nabídnout.
  await expect(page.getByRole("button", { name: "Povolit" })).toHaveCount(0);
});
