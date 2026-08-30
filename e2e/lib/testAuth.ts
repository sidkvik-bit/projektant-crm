import type { Session } from "@supabase/supabase-js";

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
