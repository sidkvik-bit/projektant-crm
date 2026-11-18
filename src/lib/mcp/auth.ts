import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_PREFIX = "pcrm_";

export function generateMcpToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashMcpToken(token) };
}

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface McpSession {
  userId: string;
  organizationId: string;
  /** Klient pod identitou uživatele — RLS na něj platí stejně jako ve webové appce. */
  supabase: SupabaseClient;
}

/**
 * Vymění osobní MCP token za klienta jednajícího ZA TOHO UŽIVATELE.
 *
 * Service_role se tu používá výhradně na jednu věc: dohledat, komu token patří (to nejde
 * udělat jinak — před ověřením ještě nevíme, kdo volá). Samotná data se přes něj NIKDY
 * nečtou; vrácený `supabase` klient nese access token uživatele, takže veškerá izolace
 * organizací zůstává na Postgresu, ne na správnosti tohohle kódu.
 *
 * Supabase access token se drží v řádku do vypršení (~1 h) a teprve pak se relace obnoví;
 * refresh tokeny se při obnově rotují, takže se nový hned ukládá zpátky. Když uživatel
 * odhlásí všechna zařízení, další obnova selže a token přestane fungovat — to je záměr
 * (nejpozději do vypršení uloženého access tokenu, stejně jako u přihlášeného prohlížeče).
 */
export async function resolveMcpSession(token: string): Promise<McpSession | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mcp_tokens")
    .select("id, user_id, refresh_token, revoked_at, expires_at, supabase_access_token, supabase_access_expires_at")
    .eq("token_hash", hashMcpToken(token))
    .maybeSingle();

  if (!row || row.revoked_at) return null;
  // Ručně vygenerované tokeny expiraci nemají (null) a platí do odvolání; tokeny vydané přes
  // OAuth ano — po vypršení musí klient použít refresh token, ne tenhle.
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) return null;

  const accessToken = isSupabaseAccessFresh(row.supabase_access_expires_at as string | null)
    ? (row.supabase_access_token as string)
    : await refreshSupabaseAccess(admin, row.id as string, row.refresh_token as string);
  if (!accessToken) return null;

  // last_used_at je jen informace pro uživatele v nastavení — její selhání request neshodí.
  await admin.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );

  // Organizaci čteme už tímhle (uživatelským) klientem — kdyby se identita nepropsala,
  // nevrátí se nic a request skončí, místo aby se tiše pokračovalo bez kontextu.
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("user_id", row.user_id as string)
    .maybeSingle();
  if (!profile) return null;

  return { userId: row.user_id as string, organizationId: profile.organization_id, supabase };
}

/** Rezerva před vypršením Supabase access tokenu — ať nevyprší uprostřed volání nástroje. */
const SUPABASE_ACCESS_MARGIN_MS = 5 * 60 * 1000;

/** Je uložený Supabase access token ještě použitelný? Čistá funkce kvůli testům. */
export function isSupabaseAccessFresh(expiresAt: string | null, now: number = Date.now()) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - SUPABASE_ACCESS_MARGIN_MS > now;
}

/**
 * Obnoví Supabase relaci konektoru a uloží nový refresh i access token zpátky do řádku.
 *
 * Dřív se relace obnovovala při každém volání nástroje a výsledek se ukládal bez kontroly
 * chyby. Claude volá nástroje často souběžně; když se nový refresh token neuložil nebo se
 * dva požadavky přetahovaly, další volání poslalo už použitý token, Supabase relaci zrušil
 * jako zneužitou a konektor chtěl nové přihlášení. Teď se obnovuje jen jednou za ~hodinu
 * (access token se drží v řádku), uložení se kontroluje a při neúspěchu se jednou zkusí
 * token, který mezitím uložil souběžný požadavek.
 */
async function refreshSupabaseAccess(
  admin: SupabaseClient,
  rowId: string,
  refreshToken: string,
  allowRetry = true,
): Promise<string | null> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: refreshed, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !refreshed.session) {
    // Souběžný požadavek mohl relaci obnovit dřív a uložit novější token — zkusit ten.
    const { data: latest } = await admin
      .from("mcp_tokens")
      .select("refresh_token, supabase_access_token, supabase_access_expires_at")
      .eq("id", rowId)
      .maybeSingle();
    if (latest && isSupabaseAccessFresh(latest.supabase_access_expires_at as string | null)) {
      return latest.supabase_access_token as string;
    }
    if (allowRetry && latest && latest.refresh_token !== refreshToken) {
      return refreshSupabaseAccess(admin, rowId, latest.refresh_token as string, false);
    }
    return null;
  }

  const session = refreshed.session;
  const expiresAt = new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000);
  const { error: saveError } = await admin
    .from("mcp_tokens")
    .update({
      refresh_token: session.refresh_token,
      supabase_access_token: session.access_token,
      supabase_access_expires_at: expiresAt.toISOString(),
    })
    .eq("id", rowId);
  // Bez uložení by příští volání poslalo už spotřebovaný refresh token a relaci by to zrušilo.
  // Tenhle request doběhne (access token máme), ale chybu je potřeba vidět v logu.
  if (saveError) console.error("MCP: nový Supabase refresh token se nepodařilo uložit", saveError.message);

  return session.access_token;
}
