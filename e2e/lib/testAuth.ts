import { createClient, type Session } from "@supabase/supabase-js";

export const TEST_EMAIL = "e2e-tester@projektant-crm.test";
export const TEST_PASSWORD = "E2eTest!Passw0rd2026";
export const TEST_ORG_NAME = "E2E Test Org";

export function projectRefFromUrl(url: string) {
  return new URL(url).hostname.split(".")[0];
}

/** Builds the {name, value} cookie pair @supabase/ssr expects for a given session. */
export function buildAuthCookie(supabaseUrl: string, session: Session) {
  return {
    name: `sb-${projectRefFromUrl(supabaseUrl)}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
  };
}

/**
 * Builds a Playwright storageState for a given (already-existing, confirmed) user — same
 * mechanism global-setup.ts uses for the shared test user, reused by specs that need an
 * isolated second identity (e.g. a second tenant) without touching the shared session.
 */
export async function buildStorageState(anonUrl: string, anonKey: string, email: string, password: string) {
  const anon = createClient(anonUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`Přihlášení testovacího uživatele ${email} selhalo`);

  const cookie = buildAuthCookie(anonUrl, data.session);

  return {
    cookies: [
      {
        name: cookie.name,
        value: cookie.value,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}
