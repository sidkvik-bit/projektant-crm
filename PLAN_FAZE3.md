# Projektant CRM — plán zbývající práce (Fáze 3+)

Návrh architektury pro vše, co zbývá postavit. Inspirováno Dynamics 365 Sales
tam, kde to dává smysl (Kanban = pipeline view, Activities = "Regarding" vzor,
Dashboard = "Můj den" ~ D365 "My Open Records", status/status reason). Nic se
z tohoto souboru nestaví, dokud ho spolu neprojdeme.

---

## 0. Layout appky (staví se první — bez něj nejde nic propojit)

Route group `src/app/(app)/` pro všechny přihlášené stránky (URL se nemění,
`(app)` je jen organizační). Obsahuje sdílený `layout.tsx` s:
- Horní/boční navigace: Můj den, Kanban, Leads, Accounts, Contacts, Projekty,
  Nastavení (Tým, Číselníky)
- Zvoneček (dropdown nepřečtených notifikací) v headeru
- Avatar/jméno přihlášeného uživatele (z `users` tabulky) + odhlásit

Existující `/leads`, `/settings/team` se přesunou pod `(app)/`, `/login`,
`/auth/callback`, `/onboarding`, `/api/*` zůstávají mimo (žádná navigace).

---

## 1. Číselníkové admin UI

- `/settings/option-sets` — seznam číselníků organizace (GridEngine nad
  `option_sets`)
- `/settings/option-sets/[id]` — hodnoty číselníku: tabulka (popisek, pořadí,
  aktivní/needvěaktivní), formulář na přidání, inline editace
- Mazání jen pro nepoužité hodnoty (cizí klíč to stejně ohlídá) — jinak
  deaktivace přes `is_active`

---

## 2. Zbývajících 8 entit (stejný vzor jako Lead: Entity.json + FormXml + SavedQueries)

Pole beru přesně z toho, co už je v DB (Fáze 1) — žádná nová pole navíc, jen
zabalení do metadat enginu. Dvě výjimky, kde chybí kus datového modelu — viz
**Otevřené otázky** níže.

| Entita | Klíčová pole (mimo systémová + status/status_reason) |
|---|---|
| **Account** | name, ico, billing_address |
| **Contact** | account_id (lookup), name, email, phone, profese_id (optionset) |
| **Project_Template** | name |
| **Template_Milestone** | template_id (lookup), name, offset_dni |
| **Project** | account_id (lookup), name, datum_zahajeni, deadline, drive_url, *+ project_template_id (lookup, nové — viz otázka 1)* |
| **Project_Milestone** | project_id (lookup), name, termin_splneni, splneno |
| **Activity** | entity_type + entity_id (polymorfní "Regarding"), activity_type_id (optionset), subject, description, activity_date |
| **Notifications_Config** | milestone_id (lookup), type (EMAIL/PUSH), dni_predem, recipient_user_id (lookup na users) |

Grid views: pro každou entitu alespoň jeden "Aktivní záznamy" SavedQuery
(stejně jako `active_leads.json`).

---

## 3. Klíčové views (sekce 6 zadání)

### 3.1 Dashboard "Můj den"
3 sloupce nad `project_milestones` (splneno = false):
- **Hoří** — termin_splneni < dnes
- **Dalších 7 dní** — termin_splneni mezi dnes a +7 dní
- **Rychlé akce** — tlačítka: Nový Lead, Nový Projekt, Nová Aktivita

*(Viz otázka 2 — bez "přiřazeno komu" na milníku je to "Náš den", ne "Můj den".)*

### 3.2 Kanban board
- Sloupce = hodnoty číselníku `project_status_reason` (ten, co už existuje)
- Karta: název projektu, klient (account), nejbližší nesplněný milník
- Drag&drop mezi sloupci = update `status_reason_id` (žádná vynucená
  posloupnost, číselník je otevřený — jak jsme se domluvili dřív)
- Knihovna: `@dnd-kit/core` (moderní, udržovaná náhrada za nefungující
  react-beautiful-dnd)

### 3.3 Detail projektu (taby)
1. **Úkoly / Milníky** — editovatelný grid nad `project_milestones` + tlačítko
   "Notifikace" (otevře mini-formulář na `notifications_config`)
2. **Historie a aktivity** — `activities` filtrované na `entity_type='Project'`
3. **Tým / Subdodavatelé** — *(viz otázka 3 — chybí propojovací tabulka)*

---

## 4. Byznys logika

- **Generování milníků**: při vytvoření Projektu s vybranou šablonou se
  `Template_Milestones` zkopírují do `Project_Milestones`,
  `termin_splneni = datum_zahajeni + offset_dni`
- **Google Smart Links**: `mailto:`, Google Calendar URL šablona, odkaz na
  `drive_url` — čistě UI tlačítka, žádná API integrace (dle zadání)
- **PUSH generování**: rozšíření cronu o `type = 'PUSH'` — vytvoří řádek v
  `notifications`, pokud `dnes >= termin_splneni − dni_predem` a ještě
  neexistuje (idempotence)

---

## 5. Smart Excel Import Wizard

Obecná komponenta `src/engine/ImportWizard.tsx` — parametrizovaná
`EntityDefinition` (stejná filozofie jako FormEngine/GridEngine, ne
one-off řešení jen pro jednu entitu):
1. Vygeneruj a stáhni vzorový `.xlsx` (SheetJS, hlavičky z Entity.json)
2. Drag & drop nahrání zpět, parsování (SheetJS)
3. Validace řádků (stejný Zod schema jako formulář), zvýraznění chyb,
   import až po zeleném stavu

---

## 6. Infrastruktura (na konec)

- CRM-PROD Supabase (`dawhsgrfotodjtdwrljc`) — zatím jen poznamenané, žádné
  migrace tam nejdou, dokud neřekneš
- Vercel: ověřit DEV/PROD propojení na `develop`/`main`, `vercel.json` s
  cron `0 8 * * *` → `/api/cron/daily-digest`, `CRON_SECRET` v env
- Resend: vlastní ověřená doména (teď jen sandbox, posílá jen na tebe)

---

## Otevřené otázky — potřebuju tvoje rozhodnutí, než začnu

1. **Project.project_template_id** — přidám nové pole na Project (které
   šablona se použila při založení), aby šlo dohledat/zobrazit. Souhlas?

2. **"Můj den" — přiřazení konkrétnímu uživateli.** V datech teď nikde není
   pole "kdo je za tohle zodpovědný" (ani na Projektu, ani na Milníku).
   Bez něj je Dashboard fakticky za celou firmu, ne za tebe osobně.
   - (a) Přidat `assigned_to` (lookup na `users`) na `Project_Milestones`,
     Dashboard pak filtruje na "moje" + zbytek firmy vidíš v Kanbanu
   - (b) Nechat to tak — "Můj den" = "Den naší firmy", žádný filtr

3. **Tab "Tým / Subdodavatelé" na detailu projektu.** Contacts jsou teď
   navázané jen na Account, ne na konkrétní Projekt — takže dnes nejde
   zobrazit "kdo dělá na tomhle projektu". Navrhuju novou propojovací
   tabulku `project_contacts` (project_id + contact_id) — malá, žádná
   vlastní pole navíc (profese se bere z Contactu). Souhlas, nebo to má
   fungovat jinak?

4. **Pořadí realizace** — navrhuju: Layout → Číselníky UI → 8 entit → Views
   (Dashboard/Kanban/Detail) → byznys logika → Excel import → infra na
   závěr. Sedí ti to, nebo chceš jinak (např. napřed Kanban, ať je vidět
   "produkt" co nejdřív)?
