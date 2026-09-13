import { test, expect } from "@playwright/test";

/**
 * Veřejná úvodní stránka — přímo pokrývá podmínky, které Google vytkl při ověřování OAuth
 * appky: (1) ověřovací meta tag, (2) domovská stránka nesmí být za login wallem,
 * (3) musí být z ní jasné, co appka dělá, (4) název se musí shodovat s "App name" v Google
 * Cloud Console ("ProjektantCRM").
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("home page is publicly reachable without logging in", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  // Žádné přesměrování na /login — právě tohle Google vytkl.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /CRM pro projektanty/i })).toBeVisible();
});

test("google-site-verification meta tag follows the GOOGLE_SITE_VERIFICATION env var", async ({ page }) => {
  // Ověřovací kód je vázaný na konkrétní doménu, takže není v kódu napevno — tag se vykreslí
  // jen tam, kde je proměnná nastavená (zatím dev prostředí, produkce ji nemá).
  const expected = process.env.GOOGLE_SITE_VERIFICATION;
  await page.goto("/");
  const tag = page.locator('head meta[name="google-site-verification"]');

  if (!expected) {
    await expect(tag).toHaveCount(0);
    return;
  }
  await expect(tag).toHaveAttribute("content", expected);
});

test("home page shows the app name matching the OAuth consent screen, and explains the purpose", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ProjektantCRM").first()).toBeVisible();

  // Účel + konkrétní funkce, ne jen přihlašovací obrazovka.
  await expect(page.getByRole("heading", { name: "Co ProjektantCRM umí" })).toBeVisible();
  await expect(page.getByText("Projekty s milníky a termíny")).toBeVisible();
  await expect(page.getByText("Nabídky a faktury")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro koho to je" })).toBeVisible();

  // Právní odkazy, které jsou zároveň vyplněné v Google konzoli.
  await expect(page.getByRole("link", { name: "Zásady ochrany osobních údajů" })).toHaveAttribute("href", "/Privacy");
  await expect(page.getByRole("link", { name: "Podmínky užití" })).toHaveAttribute("href", "/Toc");
});

test("a logged-out visitor gets a login call to action, and protected routes still redirect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Přihlásit se" }).first()).toBeVisible();

  // Pojistka, že zveřejnění "/" neotevřelo celou appku (startsWith("/") by pustilo všechno).
  await page.goto("/accounts");
  await expect(page).toHaveURL(/\/login/);
});
