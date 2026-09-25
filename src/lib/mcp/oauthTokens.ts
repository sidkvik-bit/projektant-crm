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
 * Obnoví tokeny z refresh tokenu. OAuth 2.1 u veřejných klientů vyžaduje rotaci, takže starý
 * pár se odvolá a vznikne nový — refresh token se nedá použít dvakrát.
 */
export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientName: string | null;
}): Promise<ExchangeResult> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mcp_tokens")
    .select("id, user_id, client_id, refresh_token, revoked_at")
    .eq("oauth_refresh_hash", hashSecret(input.refreshToken))
    .maybeSingle();

  const invalid = { error: "invalid_grant", description: "Refresh token není platný." };
  if (!data || data.revoked_at) return invalid;
  if (data.client_id !== input.clientId) return invalid;

  const { data: revoked } = await admin
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (!revoked) return invalid;

  const tokens = await issueTokenPair({
    userId: data.user_id as string,
    clientId: input.clientId,
    clientName: input.clientName,
    supabaseRefreshToken: data.refresh_token as string,
  });
  return { tokens };
}
