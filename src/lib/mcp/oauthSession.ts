import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Založí konektoru (MCP) VLASTNÍ Supabase relaci uživatele a vrátí její refresh token.
 *
 * Proč ne relaci z prohlížeče: dřív se do konektoru ukládal refresh token přihlášeného okna.
 * Prohlížeč i konektor pak rotovaly tentýž token a ten, kdo přišel se starým, způsobil, že
 * Supabase celou relaci zrušil jako zneužitou — konektor chtěl nové přihlášení a uživatele to
 * často odhlásilo i z webu.
 *
 * Jak: admin vygeneruje jednorázový přihlašovací odkaz (nic se neposílá e-mailem) a server ho
 * hned sám ověří. Výsledkem je nová, nezávislá relace téhož uživatele — dotazy konektoru dál
 * běží pod jeho identitou a platí na ně RLS jako dřív.
 *
 * Volá se jen po ověřeném souhlasu přihlášeného uživatele (OAuth „Povolit“, nový token
 * v nastavení) a vždy pro jeho vlastní user id.
 */
export async function createDedicatedRefreshToken(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) throw new Error("Nepodařilo se načíst uživatele pro připojení konektoru.");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new Error("Nepodařilo se připravit přihlášení konektoru.");

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const session = verified?.session;
  if (verifyError || !session?.refresh_token) throw new Error("Nepodařilo se přihlásit konektor.");
  // Pojistka: odkaz musí přihlásit přesně toho uživatele, který souhlas dal.
  if (session.user.id !== userId) throw new Error("Přihlášení konektoru nesouhlasí s uživatelem.");

  return session.refresh_token;
}
