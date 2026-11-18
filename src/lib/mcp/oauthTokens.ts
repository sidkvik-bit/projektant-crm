import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vydávání a ověřování OAuth kódů a tokenů.
 *
 * Access token, který tu vznikne, je záměrně obyčejný řádek v `mcp_tokens` — přesně takový, jaký
 * si uživatel umí vygenerovat ručně v nastavení. Díky tomu `resolveMcpSession()` ani jeden nástroj
 * nepotřebují vědět, jestli přišel token z OAuthu nebo z nastavení, a izolace organizací dál stojí
 * na tomtéž Supabase refresh tokenu a RLS.
 */

/** Kód je jednorázová směnka na token — minuta života bohatě stačí a zkracuje okno pro zneužití. */
const CODE_TTL_MS = 60 * 1000;
/** Claude si token cachuje, jen když expirace vyjde mezi 5 minutami a dnem. */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Ověření PKCE: z verifieru musí po SHA-256 a base64url vyjít uložená challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string) {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  // Délku je nutné porovnat zvlášť — timingSafeEqual na různě dlouhých bufferech vyhodí výjimku.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  supabaseRefreshToken: string;
}) {
  const code = randomBytes(32).toString("base64url");
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_authorization_codes").insert({
    code_hash: hashSecret(code),
    client_id: input.clientId,
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    supabase_refresh_token: input.supabaseRefreshToken,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return code;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Vytvoří pár access + refresh token nad daným Supabase refresh tokenem uživatele. */
async function issueTokenPair(input: {
  userId: string;
  clientId: string;
  clientName: string | null;
  supabaseRefreshToken: string;
}): Promise<IssuedTokens> {
  const accessToken = `pcrm_oauth_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `pcrmr_${randomBytes(32).toString("base64url")}`;

  const admin = createAdminClient();
  const { error } = await admin.from("mcp_tokens").insert({
    user_id: input.userId,
    name: input.clientName ?? "OAuth klient",
    token_hash: hashSecret(accessToken),
    refresh_token: input.supabaseRefreshToken,
    client_id: input.clientId,
    oauth_refresh_hash: hashSecret(refreshToken),
    expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw error;

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export type ExchangeResult = { tokens: IssuedTokens } | { error: string; description: string };

/**
 * Vymění autorizační kód za tokeny. Kód musí sedět na klienta i návratovou adresu, nesmí být
 * propadlý ani použitý a musí projít PKCE — teprve pak se z něj stane token.
 */
export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  clientName: string | null;
}): Promise<ExchangeResult> {
  const admin = createAdminClient();
  const codeHash = hashSecret(input.code);

  const { data } = await admin
    .from("oauth_authorization_codes")
    .select("client_id, user_id, redirect_uri, code_challenge, supabase_refresh_token, expires_at, consumed_at")
    .eq("code_hash", codeHash)
    .maybeSingle();

  const invalid = { error: "invalid_grant", description: "Autorizační kód není platný." };
  if (!data) return invalid;
  if (data.consumed_at) return invalid;
  if (new Date(data.expires_at).getTime() < Date.now()) return invalid;
  if (data.client_id !== input.clientId) return invalid;
  if (data.redirect_uri !== input.redirectUri) return invalid;
  if (!verifyPkceS256(input.codeVerifier, data.code_challenge)) return invalid;

  // Označíme kód za spotřebovaný dřív, než vydáme token, a to podmíněně — kdyby dva požadavky
  // dorazily současně, druhý neaktualizuje nic a odejde s chybou místo druhého tokenu.
  const { data: consumed } = await admin
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .select("code_hash")
    .maybeSingle();
  if (!consumed) return invalid;

  const tokens = await issueTokenPair({
    userId: data.user_id,
    clientId: input.clientId,
    clientName: input.clientName,
    supabaseRefreshToken: data.supabase_refresh_token,
  });
  return { tokens };
}

/**
 * Jak dlouho po rotaci ještě platí PŘEDCHOZÍ refresh token. Klient (Claude) občas obnovu
 * zopakuje — ztratí odpověď, nebo pošle dvě obnovy naráz. Bez tolerance to znamenalo
 * invalid_grant a uživatel se musel přihlásit znovu. Dvě minuty pokryjí opakování po síťové
 * chybě, a přitom zůstává okno pro zneužití uniklého starého tokenu krátké.
 */
export const REFRESH_REUSE_GRACE_MS = 2 * 60 * 1000;

/** Smí se předchozí refresh token ještě použít? Čistá funkce kvůli testům. */
export function isWithinReuseGrace(rotatedAt: string | null, now: number = Date.now()) {
  if (!rotatedAt) return false;
  const age = now - new Date(rotatedAt).getTime();
  return age >= 0 && age <= REFRESH_REUSE_GRACE_MS;
}

/**
 * Obnoví tokeny z refresh tokenu. OAuth 2.1 u veřejných klientů vyžaduje rotaci: vydá se nový
 * pár a starý přestane platit (po krátké toleranci, viz REFRESH_REUSE_GRACE_MS).
 *
 * Rotuje se NA MÍSTĚ — stejný řádek dostane nové hashe. Dřív vznikal nový řádek s kopií
 * Supabase refresh tokenu; každá další kopie téže relace mohla zastarat a její použití pak
 * Supabase vyhodnotil jako zneužití a zrušil relaci. Jedno připojení = jeden řádek.
 */
export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientName: string | null;
}): Promise<ExchangeResult> {
  const admin = createAdminClient();
  const hash = hashSecret(input.refreshToken);
  const invalid = { error: "invalid_grant", description: "Refresh token není platný." };

  const { data: current } = await admin
    .from("mcp_tokens")
    .select("id, client_id, revoked_at, oauth_refresh_hash")
    .eq("oauth_refresh_hash", hash)
    .maybeSingle();

  let row = current;
  if (!row) {
    // Předchozí token, použitý znovu krátce po rotaci → vydat nový pár místo odhlášení.
    const { data: previous } = await admin
      .from("mcp_tokens")
      .select("id, client_id, revoked_at, oauth_refresh_hash, rotated_at")
      .eq("previous_refresh_hash", hash)
      .maybeSingle();
    if (!previous || !isWithinReuseGrace(previous.rotated_at as string | null)) return invalid;
    row = previous;
  }
  if (row.revoked_at) return invalid;
  if (row.client_id !== input.clientId) return invalid;

  const accessToken = `pcrm_oauth_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `pcrmr_${randomBytes(32).toString("base64url")}`;

  // Podmíněně na aktuální hash: kdyby dvě obnovy proběhly přesně současně, druhá nezmění nic
  // a skončí jako neplatná, místo aby jedna druhé tiše přepsala tokeny.
  const { data: rotated, error } = await admin
    .from("mcp_tokens")
    .update({
      token_hash: hashSecret(accessToken),
      oauth_refresh_hash: hashSecret(refreshToken),
      previous_refresh_hash: row.oauth_refresh_hash,
      rotated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
      ...(input.clientName ? { name: input.clientName } : {}),
    })
    .eq("id", row.id)
    .eq("oauth_refresh_hash", row.oauth_refresh_hash as string)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!rotated) return invalid;

  return { tokens: { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS } };
}
