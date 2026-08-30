# Projektant CRM - Architektonický a technický blueprint

## ⚠️ INSTRUKCE PRO CLAUDE (AI DEVELOPER)
Tento dokument definuje exaktní architekturu a rozsah funkcí pro systém **Projektant CRM**. 
**Pravidla pro tebe (Claude):**
1. Striktně se drž tohoto zadání. Nevymýšlej si žádné funkce, tabulky ani integrace navíc, které zde nejsou popsány.
2. Jdeme cestou "lean" a minimalismu z pohledu UI, ale s maximální architektonickou čistotou na pozadí. Celá datová struktura, definice entit, formulářů a pohledů **musí striktně reflektovat koncept a strukturu PowerApps Solution** (viz složkový model inspirovaný rozbaleným Solution.xml).
3. **ZÁKLADNÍ PRAVIDLO:** Pokud něčemu v zadání nerozumíš, chybí ti detail pro implementaci, nebo si nejsi 100% jistý, jak jsme to mysleli – **ZASTAV SE A ZEPTEJ SE UŽIVATELE.** Nezačínej psát kód, dokud s ním nejsi v absolutním souladu.

---

## 1. Technologický Stack a Infrastruktura
* **Název projektu:** Projektant CRM
* **Frontend:** Next.js (App Router), React, Tailwind CSS, shadcn/ui.
* **Backend a Databáze:** Supabase (PostgreSQL), Supabase Auth.
* **Hosting:** Vercel.
* **Prostředí a Git:**
  * `main` větev = PROD prostředí (Vercel) -> připojeno na `CRM-PROD` Supabase.
  * `develop` větev = DEV prostředí (Vercel) -> připojeno na `CRM-DEV` Supabase.
  * Veškeré změny v DB se řeší exkluzivně přes **Supabase SQL migrace** (žádné ruční klikání v produkční databázi).

---

## 2. Architektura systému (Inspirace PowerApps / Dataverse Solution)
Systém nevyužívá hardcoded formuláře a tabulky. Je postaven na **Metadata-driven architektuře** a kopíruje logiku a strukturu vyexportované PowerApps Solution (rozdělenou do složek). Aplikace je rozdělena na:

1. **`/src/engine/`**: Jádro systému (Dataverse Engine). Obsahuje `FormEngine.tsx`, `GridEngine.tsx` a `Database.ts`. Tyto komponenty dynamicky generují UI (pomocí React Hook Form + Zod) na základě JSON konfigurací ze Solution.
2. **`/src/solutions/Projektant_CRM/`**: Zde jsou uloženy customizace (ekvivalent unmanaged solution):
   * `solution.json` (metadata solution)
   * `/OptionSets/` (Globální ENUMy - např. `project_status.json`)
   * `/Entities/` (Definice entit, např. `/Project/Entity.json`, `/FormXml/main_form.json`, `/SavedQueries/active_projects.json`)
   * OptionSet = v databázi řešeno striktně přes PostgreSQL `ENUM`.

---

## 3. Pravidla Databáze a Multi-tenancy
* **Multi-tenancy:** Aplikace je SaaS-ready. Existuje tabulka `Organizations`. Každý uživatel spadá do organizace. Všechny databázové tabulky (Projekty, Kontakty, atd.) **MUSÍ** mít sloupec `organization_id`. Ochrana dat je řešena přes **Supabase RLS** (uživatel vidí pouze data své organizace). Oprávnění na úrovni rolí (Admin/User) se zatím neřeší, všichni ve firmě mají stejná práva.
* **Systémová pole:** Každá entitní tabulka musí obsahovat: `id` (UUID), `created_at`, `updated_at`, `created_by` (UUID), `modified_by` (UUID), `organization_id`.
* **Audit Log:** Jakákoliv změna dat je na pozadí logována přes **PostgreSQL Triggers**. Loguje se do tabulky `Audit_Logs` (id, table_name, record_id, action, old_values (JSONB), new_values (JSONB), changed_by, created_at).
* **Timezones:** Všechny časy a data se do Supabase ukládají striktně v **UTC**. Převod na lokální čas se děje až na frontendu. V systému existuje tabulka `User_Preferences` (user_id, timezone, language, theme), primárně s defaultem pro 'Europe/Prague' a 'cs-CZ'.

---

## 4. Datový model (Hlavní Entity)
1. **Leads (Zájemci):** Jméno, kontakt, poptávka, stav, očekávaná hodnota.
2. **Accounts (Firmy/Klienti):** Název, IČO, fakturační adresa.
3. **Contacts (Lidé/Profese):** Vazba na Account, jméno, kontakt, pozice (investor, statik...).
4. **Project_Templates:** Šablony projektů (např. Rodinný dům).
5. **Template_Milestones:** Definice kroků šablony (název kroku, offset_dni).
6. **Projects (Projekty):** Vazba na Account, název, stav, datum_zahajeni, deadline, `drive_url` (odkaz na Google Drive složku).
7. **Project_Milestones (Úkoly):** Konkrétní to-do vygenerované ze šablony. Lze je ručně přidávat a upravovat. Mají konkrétní `termin_splneni` (datum) a stav `splneno`.
8. **Activities:** Záznamy o komunikaci k entitám.
9. **Notifications_Config:** Konfigurace upozornění na milník (1:N k milníku). Typ: EMAIL nebo PUSH (zvoneček). Atribut `dni_predem`.

---

## 5. Klíčové Funkcionality a Integrace

### Generování milníků
Při založení nového Projektu a výběru Šablony systém vezme data z `Template_Milestones` a zkopíruje je do `Project_Milestones` s automatickým dopočtem data (datum zahájení projektu + offset_dni).

### Google Workspace (Minimalistická integrace pomocí Smart Links)
* **Auth:** Přihlášení uživatele výhradně přes Google SSO (Supabase Auth).
* **E-maily:** Tlačítko "Napsat e-mail" v detailu entity otevírá standardní URL mailto nebo webový odkaz na Gmail s předvyplněným adresátem a předmětem (název projektu). Žádná backendová API integrace.
* **Schůzky:** Tlačítko "Nová schůzka" otevírá URL Google Kalendáře (předvyplněný host a název události). Žádná backendová API integrace.
* **Dokumenty:** Tlačítko "Otevřít složku projektu" pouze otevírá URL uložené v poli `drive_url`.

### Notifikace (Daily Digest a PUSH)
* **In-app (Zvoneček):** Upozornění typu PUSH se zobrazují v aplikaci jako nepřečtená podle data.
* **E-mail (Daily Digest):** Žádný spam. Existuje jeden Cron Job (Vercel/Supabase), který se spustí každý den v 8:00. Přečte `Notifications_Config`, sesbírá úkoly na dnešek a úkoly po termínu a odešle uživateli **jeden souhrnný e-mail** (např. přes Resend API).

### Smart Excel Import
* Tříkrokový průvodce (Import Wizard) pomocí klientské knihovny `xlsx` (SheetJS).
* Krok 1: Aplikace vygeneruje a stáhne uživateli vzorový Excel podle polí dané entity.
* Krok 2: Drag & Drop vyplněného souboru zpět.
* Krok 3: Zobrazení tabulky na frontendu + lokální validace (Zod) se zvýrazněním chyb. Odeslání do DB až po úspěšné validaci (zelený stav).

---

## 6. Uživatelské rozhraní (Views)
1. **Dashboard "Můj den":**
   * PUSH notifikace.
   * 3 sloupce: Hoří (po termínu) | Úkoly na dalších 7 dní | Rychlé akce (Tlačítka).
2. **Kanban board:**
   * Sloupce dle fází projektu (Poptávka -> Realizace). Karty jdou přetahovat, obsahují klienta a nejbližší milník.
3. **Detail Projektu (Tabbed View):**
   * Záložka 1: Úkoly / Milníky (editovatelný grid, tlačítka pro notifikace).
   * Záložka 2: Historie a aktivity.
   * Záložka 3: Tým / Subdodavatelé (Profese).