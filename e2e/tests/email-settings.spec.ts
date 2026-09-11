import { test, expect } from "@playwright/test";

test("email settings page shows the disconnected state, instructions, and a connect button", async ({ page }) => {
  await page.goto("/settings/email");

  await expect(page.getByRole("heading", { name: "Sledování e-mailů" })).toBeVisible();
  await expect(page.getByText("Žádná schránka není připojená")).toBeVisible();
  await expect(page.getByRole("button", { name: "Připojit e-mailovou schránku" })).toHaveAttribute(
    "href",
    "/api/google/gmail/authorize",
  );

  // Návod — všech 5 kroků musí být vidět, ať je jasné co udělat i bez připojené schránky.
  await expect(page.getByText("Založ dedikovanou schránku")).toBeVisible();
  await expect(page.getByText("Nastav automatické BCC pravidlo")).toBeVisible();
  await expect(page.getByText("Povol Gmail API a přidej redirect URI")).toBeVisible();
  await expect(page.getByText("Zapni pravidelnou synchronizaci")).toBeVisible();
});

test("the Gmail OAuth authorize route redirects to Google's consent screen (auth'd session, not followed)", async ({ request }) => {
  const response = await request.get("/api/google/gmail/authorize", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("accounts.google.com/o/oauth2/v2/auth");
  expect(response.headers()["location"]).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly");
});
