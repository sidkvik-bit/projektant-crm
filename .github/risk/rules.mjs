// Semafor změn — jediný zdroj pravidel pro GitHub Action (risk-gate.yml) i Claude hook
// (.claude/hooks/risk-gate.mjs). Úroveň změny = nejhorší úroveň ze všech pravidel, která na ni sedí.
//
//   green  — projde bez ptaní
//   orange — Claude vysvětlí dopad a zeptá se autora, ale projde bez Honzova schválení
//   red    — PR čeká na schválení od Honzy (@sidkvik-bit)
//
// Tenhle adresář je v CODEOWNERS — změna pravidel je sama o sobě červená.

/** Pravidla podle cesty souboru. `statuses` omezí pravidlo na typ změny (A přidán, M změněn, D smazán). */
export const PATH_RULES = [
  // --- červené: pojistky samotné ---
  { level: "red", test: /^\.github\//, reason: "pravidla schvalování a CI (semafor sám)" },
  { level: "red", test: /^\.claude\/(settings\.json|hooks\/)/, reason: "pojistky Clauda (hooky, nastavení)" },
  { level: "red", test: /^CODEOWNERS$/, reason: "kdo musí co schvalovat" },
  { level: "red", test: /^\.env/, reason: "tajné klíče" },

  // --- červené: bezpečnost a oddělení firem ---
  { level: "red", test: /^src\/proxy\.ts$/, reason: "ochrana přihlášení na všech stránkách" },
  { level: "red", test: /^src\/lib\/supabase\//, reason: "připojení k databázi — admin klient obchází oddělení firem (RLS)" },
  { level: "red", test: /^src\/app\/(auth|oauth)\//, reason: "přihlašování" },
  { level: "red", test: /^src\/app\/api\/oauth\//, reason: "přihlašování AI klientů (OAuth)" },
  { level: "red", test: /^src\/lib\/mcp\/(auth|oauth)/, reason: "přihlašování AI klientů (MCP tokeny)" },
  { level: "red", test: /^src\/app\/api\/cron\//, reason: "noční úlohy běží s plným přístupem ke všem firmám" },
  { level: "red", test: /^src\/app\/\(app\)\/admin\//, reason: "platformová administrace nad všemi firmami" },
  { level: "red", test: /^src\/customization\/sandbox\//, reason: "sandbox pro skripty firem — bezpečnostní hranice" },
  {
    level: "red",
    test: /^supabase\/migrations\//,
    statuses: ["M", "D", "R"],
    reason: "úprava nebo smazání už aplikované migrace — opravuje se vždy novou migrací",
  },

  // --- oranžové: velký dopad, ale bez schvalování ---
  { level: "orange", test: /^supabase\/migrations\//, reason: "mění strukturu databáze (po merge se sama aplikuje na DEV)" },
  { level: "orange", test: /^src\/engine\//, reason: "jádro formulářů a pohledů — projeví se u všech entit" },
  { level: "orange", test: /^src\/customization\//, reason: "vrstva úprav firem — projeví se u všech firem" },
  {
    level: "orange",
    test: /^src\/lib\/(qrPayment|czechBank|organizationBilling|invoicePdf|quotePdf)\./,
    reason: "fakturace — čísla, DPH, QR platba, PDF",
  },
  { level: "orange", test: /^src\/lib\/mcp\//, reason: "nástroje pro AI klienty (MCP)" },
  { level: "orange", test: /^src\/app\/api\//, reason: "API endpointy" },
  { level: "orange", test: /^src\/lib\/(gmail|resend|googleDrive|googleOAuth)/, reason: "napojení na Google a e-maily" },
  { level: "orange", test: /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/, reason: "knihovny a závislosti" },
  { level: "orange", test: /^(next\.config\.ts|vercel\.json|tsconfig\.json|eslint\.config\.mjs)$/, reason: "konfigurace buildu a nasazení" },
];

/** Pravidla podle obsahu přidaných řádků v migracích (SQL, bez ohledu na velikost písmen). */
export const SQL_RULES = [
  { level: "red", test: /\bdrop\s+(table|column|schema|function|policy|trigger|type|view)\b/i, reason: "maže tabulku, sloupec nebo pravidlo (DROP)" },
  { level: "red", test: /\btruncate\b/i, reason: "maže všechna data tabulky (TRUNCATE)" },
  { level: "red", test: /\bdelete\s+from\b/i, reason: "maže řádky (DELETE)" },
  { level: "red", test: /\bsecurity\s+definer\b/i, reason: "funkce obchází oddělení firem (SECURITY DEFINER)" },
  { level: "red", test: /\b(alter|drop)\s+policy\b/i, reason: "mění pravidla přístupu k datům (RLS policy)" },
  { level: "red", test: /\b(disable|no\s+force)\s+row\s+level\s+security\b/i, reason: "vypíná oddělení firem (RLS)" },
  { level: "red", test: /\brevoke\b|\bgrant\b[^;]*\bto\s+(anon|public)\b/i, reason: "mění oprávnění pro nepřihlášené" },
  { level: "red", test: /\bauth\.(users|identities|sessions|refresh_tokens)\b/i, reason: "zasahuje do přihlašování (schéma auth)" },
  { level: "red", test: /\b(allow_role_change|allow_org_change)\b/i, reason: "obchází ochranu role nebo firmy uživatele" },
  { level: "red", test: /\balter\s+column\s+\w+\s+(set\s+data\s+)?type\b/i, reason: "mění typ sloupce s existujícími daty" },
  { level: "orange", test: /\brename\b/i, reason: "přejmenovává — pozor na názvy cizích klíčů (viz skill supabase-migration)" },
  { level: "orange", test: /\bupdate\s+(public\.)?\w+\s+set\b/i, reason: "hromadně mění existující data" },
];
