/**
 * Vlastní OAuth flow pro připojení JEDNÉ dedikované Gmail schránky (ne přihlášeného
 * uživatele appky) — na rozdíl od googleOAuthOptions.ts (to jde přes Supabase Auth a mění
 * relaci přihlášeného uživatele). Tenhle flow běží nezávisle přes syrové Google OAuth
 * endpointy, ať se dá připojit libovolný Google účet (typicky crm@firma.cz), zatímco
 * admin zůstává přihlášený jako sám sebe. Viz /api/google/gmail/authorize + /callback.
 */

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function buildGmailAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GmailTokenExchange {
  access_token: string;
  refresh_token?: string;
}

/** Vymění autorizační kód za tokeny. `refresh_token` chybí, pokud Google žádný nevrátil
 * (nemělo by nastat díky access_type=offline&prompt=consent, ale API to nezaručuje). */
export async function exchangeGmailCode(code: string, redirectUri: string): Promise<GmailTokenExchange | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as GmailTokenExchange;
}

/** Zjistí e-mailovou adresu schránky, ke které token patří — uloží se vedle refresh_tokenu,
 * ať jde v UI ukázat "Připojeno jako crm@firma.cz" bez nutnosti dalšího Gmail API volání. */
export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

/** Vymění uložený refresh_token organizace za čerstvý access_token. `null` = nepřipojeno / token už neplatí. */
export async function getGmailAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}
