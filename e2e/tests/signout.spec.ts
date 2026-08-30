import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TEST_EMAIL, TEST_PASSWORD, buildAuthCookie } from "../lib/testAuth";

// Signing out revokes the session's refresh token server-side (even with
// scope: "local" — see actions.ts), so this test mints its OWN throwaway
// session instead of reusing the shared one from e2e/.auth/user.json.
// Otherwise it would invalidate every other test running against that file.
test.use({ storageState: { cookies: [], origins: [] } });

test("sign out actually signs the user out (regression: Base UI Menu.Item needs onClick, not onSelect)", async ({
  page,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error || !data.session) throw error ?? new Error("sign-in for isolated session failed");

  const cookie = buildAuthCookie(url, data.session);
  await page.context().addCookies([
    { name: cookie.name, value: cookie.value, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
  ]);

  await page.goto("/dashboard");
  await page.locator("header button").nth(1).click();
  await page.getByRole("menuitem", { name: /Odhlásit se/i }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });
});
