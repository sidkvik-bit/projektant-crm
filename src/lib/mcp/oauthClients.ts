import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Evidence OAuth klientů. Klient se k nám dostane dvěma cestami:
 *
 *  - CIMD (Client ID Metadata Document) — `client_id` JE https adresa, na které si klient
 *    zveřejnil svoje metadata. Stáhneme si je a věříme jim; nic se předem neregistruje. Tohle
 *    je cesta, kterou Claude nabízí jako doporučenou.
 *  - Dynamická registrace (RFC 7591) — klient nám metadata pošle na /register a my mu vrátíme
 *    vygenerované `client_id`. Fallback pro klienty, co CIMD neumí.
 *
 * V obou případech je závazný seznam `redirect_uris`: jen na tyhle adresy se smí vracet
 * autorizační kód. Bez toho by kdokoliv mohl poslat uživatele na /authorize s vlastní návratovou
 * adresou a odchytit si cizí kód — proto se nic nehardcoduje a všechno se ověřuje proti metadatům.
 */

export interface OAuthClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  isCimd: boolean;
}

/** Metadata se nepřetahují při každém requestu — stačí jednou za hodinu. */
const CIMD_MAX_AGE_MS = 60 * 60 * 1000;
const CIMD_FETCH_TIMEOUT_MS = 5_000;

interface ClientRow {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  is_cimd: boolean;
  metadata_refreshed_at: string | null;
}

function toClient(row: ClientRow): OAuthClient {
  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectUris: row.redirect_uris ?? [],
    isCimd: row.is_cimd,
  };
}

/** CIMD je jen to, co je https URL — cokoliv jiného je id z naší vlastní registrace. */
export function isCimdClientId(clientId: string) {
  return clientId.startsWith("https://");
}

/**
 * Stáhne a ověří CIMD dokument.
 *
 * Kontroluje se, že `client_id` uvnitř dokumentu se přesně shoduje s adresou, ze které jsme ho
 * stáhli — jinak by si klient mohl na svém webu nárokovat cizí identitu. Přesměrování se
 * nenásledují ze stejného důvodu (a kvůli SSRF).
 */
async function fetchCimdClient(clientId: string): Promise<OAuthClient | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const doc = (await response.json()) as Record<string, unknown>;

    if (doc.client_id !== clientId) return null;
    const redirectUris = Array.isArray(doc.redirect_uris)
      ? doc.redirect_uris.filter((u): u is string => typeof u === "string")
      : [];
    if (redirectUris.length === 0) return null;

    return {
      clientId,
      clientName: typeof doc.client_name === "string" ? doc.client_name : null,
      redirectUris,
      isCimd: true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Vrátí klienta podle client_id — u CIMD si metadata podle potřeby obnoví, u registrovaných
 * je přečte z databáze. `null` znamená "takového klienta neznáme", ne chybu.
 */
export async function resolveOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris, is_cimd, metadata_refreshed_at")
    .eq("client_id", clientId)
    .maybeSingle();
  const stored = data as ClientRow | null;

  if (!isCimdClientId(clientId)) return stored ? toClient(stored) : null;

  const fresh =
    stored?.metadata_refreshed_at &&
    Date.now() - new Date(stored.metadata_refreshed_at).getTime() < CIMD_MAX_AGE_MS;
  if (stored && fresh) return toClient(stored);

  const fetched = await fetchCimdClient(clientId);
  if (!fetched) return stored ? toClient(stored) : null; // síť selhala → dojedeme na uložených

  await admin.from("oauth_clients").upsert(
    {
      client_id: fetched.clientId,
      client_name: fetched.clientName,
      redirect_uris: fetched.redirectUris,
      is_cimd: true,
      metadata_refreshed_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );
  return fetched;
}

/** Uloží dynamicky registrovaného klienta (RFC 7591) a vrátí ho i s přiděleným client_id. */
export async function registerOAuthClient(input: {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_clients").insert({
    client_id: input.clientId,
    client_name: input.clientName,
    redirect_uris: input.redirectUris,
    is_cimd: false,
  });
  if (error) throw error;
  return { ...input, isCimd: false };
}

/**
 * Smí se na tuhle adresu vrátit autorizační kód?
 *
 * Porovnává se přesně, s jedinou výjimkou: u smyčky (localhost / 127.0.0.1) se ignoruje port.
 * Nativní klienti si podle RFC 8252 otevírají posluchač na náhodném portu, takže v metadatech
 * mají port bez čísla a ve skutečném požadavku konkrétní — bez téhle výjimky by desktopoví
 * klienti neprošli nikdy.
 */
export function isRedirectUriAllowed(client: OAuthClient, redirectUri: string) {
  let candidate: URL;
  try {
    candidate = new URL(redirectUri);
  } catch {
    return false;
  }

  const isLoopback = candidate.hostname === "localhost" || candidate.hostname === "127.0.0.1";
  if (!isLoopback && candidate.protocol !== "https:") return false;

  return client.redirectUris.some((allowed) => {
    if (allowed === redirectUri) return true;
    if (!isLoopback) return false;
    try {
      const registered = new URL(allowed);
      return (
        registered.hostname === candidate.hostname &&
        registered.protocol === candidate.protocol &&
        registered.pathname === candidate.pathname
      );
    } catch {
      return false;
    }
  });
}
