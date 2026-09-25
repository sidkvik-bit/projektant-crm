import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPkceS256 } from "./oauthTokens";
import { isRedirectUriAllowed, isCimdClientId, type OAuthClient } from "./oauthClients";

const client = (redirectUris: string[]): OAuthClient => ({
  clientId: "https://claude.ai/oauth/claude-code-client-metadata",
  clientName: "Claude",
  redirectUris,
  isCimd: true,
});

describe("verifyPkceS256", () => {
  it("přijme verifier, ze kterého challenge vznikla", () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  // Tohle je celá podstata PKCE: kdo odchytí kód, ale nemá verifier, nesmí dostat token.
  it("odmítne cizí verifier", () => {
    const challenge = createHash("sha256").update("spravny-verifier").digest("base64url");
    expect(verifyPkceS256("utoknikuv-verifier", challenge)).toBe(false);
  });

  it("nespadne na challenge jiné délky", () => {
    expect(verifyPkceS256("cokoliv", "kratke")).toBe(false);
  });
});

describe("isRedirectUriAllowed", () => {
  it("pustí přesně registrovanou https adresu", () => {
    const c = client(["https://claude.ai/api/mcp/auth_callback"]);
    expect(isRedirectUriAllowed(c, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });

  // Jádro ochrany: bez tohohle by šlo poslat uživatele na /authorize s vlastní adresou
  // a odchytit si jeho autorizační kód.
  it("nepustí neregistrovanou adresu, ani na stejné doméně", () => {
    const c = client(["https://claude.ai/api/mcp/auth_callback"]);
    expect(isRedirectUriAllowed(c, "https://claude.ai/utocnik")).toBe(false);
    expect(isRedirectUriAllowed(c, "https://zly-web.cz/callback")).toBe(false);
  });

  it("nepustí http mimo smyčku", () => {
    const c = client(["http://example.com/callback"]);
    expect(isRedirectUriAllowed(c, "http://example.com/callback")).toBe(false);
  });

  // Nativní klienti (Claude Desktop, Claude Code) poslouchají na náhodném portu, ale
  // v metadatech mají adresu bez portu — bez téhle výjimky by neprošli nikdy.
  it("u localhostu ignoruje port", () => {
    const c = client(["http://localhost/callback", "http://127.0.0.1/callback"]);
    expect(isRedirectUriAllowed(c, "http://localhost:53112/callback")).toBe(true);
    expect(isRedirectUriAllowed(c, "http://127.0.0.1:8123/callback")).toBe(true);
  });

  it("ani u localhostu nepustí jinou cestu nebo hostitele", () => {
    const c = client(["http://localhost/callback"]);
    expect(isRedirectUriAllowed(c, "http://localhost:53112/jinam")).toBe(false);
    expect(isRedirectUriAllowed(c, "http://zly-web.cz:53112/callback")).toBe(false);
  });

  it("nespadne na nesmyslné adrese", () => {
    expect(isRedirectUriAllowed(client(["https://claude.ai/cb"]), "tohle není url")).toBe(false);
  });
});

describe("isCimdClientId", () => {
  it("rozezná CIMD podle https adresy", () => {
    expect(isCimdClientId("https://claude.ai/oauth/claude-code-client-metadata")).toBe(true);
    expect(isCimdClientId("pcrmc_abc123")).toBe(false);
    // http není CIMD — metadata se smí stahovat jen přes https.
    expect(isCimdClientId("http://claude.ai/metadata")).toBe(false);
  });
});
