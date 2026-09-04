/**
 * Sdílené OAuth options pro přihlášení přes Google — používá jak login/page.tsx (první
 * přihlášení), tak ConnectDriveButton.tsx (dodatečné/opakované připojení Drive ke stávající
 * relaci, např. po rozšíření scope). Plný Drive scope (ne jen drive.file), protože appka
 * potřebuje zakládat podsložky uvnitř existující root složky, kterou sama nezaložila — na
 * tu by užší drive.file scope nedosáhl. access_type+prompt zajistí, že Google vždy vrátí
 * refresh_token (jinak jen krátkodobý access_token bez možnosti obnovy).
 */
export function googleOAuthOptions(redirectTo: string) {
  return {
    redirectTo,
    scopes: "https://www.googleapis.com/auth/drive",
    queryParams: { access_type: "offline", prompt: "consent" },
  };
}
