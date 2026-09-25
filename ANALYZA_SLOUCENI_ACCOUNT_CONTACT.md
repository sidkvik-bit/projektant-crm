# Analýza: kontakt jako klient projektu + tým na projektu

**Stav: rozhodnuto, neimplementováno.**
Datum: 2026-09-25 · Verze 5 (po třech kritických čteních)

> **Historie rozsahu.** Verze 1–3 počítaly s tím, že se tabulka firem **zruší** a její pole
> přejdou na kontakt. To bylo špatné pochopení: *„firmu, kterou můžu přidat buď existující, nebo
> novou"* znamená, že firma musí zůstat vlastním záznamem — pole na kontaktu vybrat nejde.
> `accounts` proto zůstává beze změny včetně názvu, menu, ARESu i fulltextu.

---

## 1. Rozhodnutí

1. **Firma zůstává vlastní tabulkou** (`accounts`), s položkou v menu. Název „Obchodní vztah"
   se nemění. ARES zůstává u ní.
2. **Kontakt na firmu odkazuje** (`contacts.account_id`, jako dnes).
3. **Všude se zadává kontakt** — projekt, nabídka i faktura míří na kontakt.
4. **Klient projektu je skutečné povinné pole** `projects.primary_contact_id`, ne odvozené z rolí:
   jinak by stačilo přepsat roli a projekt by tiše ztratil klienta i odběratele na faktuře.
5. **Tým je nová vazební tabulka** `project_contacts`. Dnes to nejde — panel Tým ukazuje kontakty
   klientovy firmy (`projects/[id]/page.tsx:114-118`), takže statika ani geodeta k projektu
   dostat nelze.
6. **Role je jen na vazbě**; `contacts.profese_id` se ruší.
7. **Odběratel na faktuře se odvodí z kontaktu** — jeho firma, a když firmu nemá, tak on sám.
   K tomu **kontakt dostane vlastní adresní pole** (§9): bez nich by soukromý klient vyšel na
   daňovém dokladu bez adresy, a to je nejběžnější případ.
8. **Časová osa projektu** sbírá aktivity klienta, členů týmu **a firmy klienta** (jinak by
   z projektu zmizela firemní e-mailová korespondence, kvůli které rollup vznikl —
   `gmailSync.ts:17-19` loguje poštu i na `entity_type='Account'`).
9. **Data jsou testovací a smažou se.**

---

## 2. Databáze

### 2.1 Změny

| Tabulka | Změna |
|---|---|
| `projects` | zrušit `account_id`; `primary_contact_id` → `NOT NULL`, `on delete restrict` |
| `quotes` | zrušit `account_id`; `contact_id` → `NOT NULL`, `restrict` |
| `invoices` | zrušit `account_id`; `contact_id` → `NOT NULL`, `restrict` |
| `contacts` | zrušit `profese_id`; **přidat `address_street`, `address_house_number`, `address_city`, `address_zip`, `address_country`** (§9) |
| `project_contacts` | **nová** |

**Nové indexy — nutné, ne kosmetika.** `projects.primary_contact_id`, `quotes.contact_id` ani
`invoices.contact_id` dnes index nemají, zatímco rušené `projects_account_id_idx`,
`quotes_account_id_idx` a `invoices_account_id_idx` padnou se sloupci. Bez nich **`on delete
restrict` prochází při každém mazání kontaktu celé tři tabulky sekvenčně**, protože kontrola
integrity nemá co použít. Přidat všechny tři.

### 2.2 Nová tabulka

```
project_contacts
  id, organization_id,
  project_id → projects(id) on delete cascade,
  contact_id → contacts(id) on delete restrict,
  role_id    → option_set_values(id),
  created_at, updated_at, created_by, modified_by,     -- POVINNÉ, viz níž
  unique (project_id, contact_id)
```

> **Nález 1 — bez systémových sloupců to spadne na prvním vložení.**
> `trg_set_insert_system_fields` (`init_core_schema.sql:317-327`) bezpodmínečně nastavuje
> `created_by`, `modified_by`, `created_at`, `updated_at`; `trg_set_update_system_fields`
> (`:329-339`) navíc čte `old.created_at`. **Tuhle chybu projekt už jednou udělal** — migrace
> `20260904161500_fix_quote_items_system_fields.sql` existuje přesně proto, že `quote_items`
> dostal triggery bez těch sloupců a insert padal na `record "new" has no field "created_by"`.

`owner_id` **nepřidávat** — vzorem je `quote_items` (čistá podřízená tabulka), ne
`project_milestones`. Ruční mašinerie tedy znamená: RLS + 4 policy, systémové triggery, audit
trigger a `organization_id` index, ale **ne** owner trigger. Přesný vzor:
`20260904160000_add_quotes.sql:77-82` (triggery bez ownera) a `:129-133` (policy, které se ptají
jen na `organization_id`). Širší rozsahy `:65-82` a `:123-133` už obsahují i owner trigger
a policy pro `quotes` — ty kopírovat nechceme.

Číselník role je `profese`; do vlastního panelu se načte přes
`getOptionSetValues(supabase, "profese")` (`engine/optionSets.ts:20-29`) — to nevyžaduje
`Entity.json`, stejný postup se už používá pro `activity_type` na `projects/[id]/page.tsx:105`.

**Přejmenování popisku číselníku** („Profese kontaktu" → role na projektu) není drobnost: label je
zadrátovaný v **sedmi** kopiích `seed_default_option_sets` a v
`src/solutions/Projektant_CRM/OptionSets/profese.json:1`. Znamená to osmou verzi té funkce plus
backfill — tedy přesně ten mechanismus, který způsobil §8. **Dělat až po opravě §8.**

### 2.3 Dvě věci, které by to jinak tiše rozbily

> **Nález 2 — vynulovaný odběratel na vystavené faktuře.**
> `quotes.contact_id` a `invoices.contact_id` jsou dnes `on delete set null`
> (`20260904160000:14`, `20260907100000:34`). Kontakt bude jediná vazba na zákazníka, takže jeho
> smazání by fakturu nesmazalo, ale vytisklo by se `—` místo odběratele
> (`api/invoices/[id]/pdf/route.ts:127`). **Proto `restrict`.**

> **Nález 3 — vnořené dotazy postavené na názvu cizího klíče.**
> Rozbijí se tato místa: `quotes/page.tsx:21`, `invoices/page.tsx:21`,
> `api/quotes/[id]/pdf/route.ts:46` a `api/invoices/[id]/pdf/route.ts:72` (všechna přes
> `*_account_id_fkey`), a kvůli rušené profesi navíc `projects/[id]/page.tsx:116`
> a `contacts/page.tsx:18` (`contacts_profese_id_fkey`).
> `api/invoices/[id]/pdf/route.ts:73` míří na `invoices_contact_id_fkey`, který zůstává —
> upravit ho je potřeba z jiného důvodu (nález 5), ne kvůli názvu klíče.
> `projects/[id]/page.tsx:140` se **nerozbije** — míří na `accounts_pravni_forma_id_fkey`, což
> zůstává. `exportToExcel.ts:36` si poradí sám, protože jméno skládá z metadat.
> **Žádná z těch chyb se neprojeví při `tsc`, `eslint` ani ve `vitest` — až za běhu.**

### 2.4 `qualify_lead`

`20260907120000:56-68` zakládá projekt s `account_id` i `primary_contact_id`; nově jen
`primary_contact_id`. Zbytek funkce (zakládání firmy, kontaktu, sloupce `converted_*`) beze změny.

---

## 3. Metadata solution

| Soubor | Změna |
|---|---|
| `Contact/Entity.json:15`, `FormXml/main_form.json:8-9`, `SavedQueries/*` (2) | zrušit `profese_id` a sloupec `profese` |
| `Contact/Entity.json`, `Contact/FormXml/main_form.json` | **přidat 5 adresních polí + sekci „Adresa"**. ARES se na kontakt **nevěší** — zůstává u firmy (rozhodnutí 1), takže adresa kontaktu se vyplňuje ručně. |
| `Project/Entity.json:10,12` | zrušit `account_id`; `primary_contact_id` → povinné, popisek „Klient" |
| `Quote/Entity.json:11-12`, `Invoice/Entity.json:12-13` | zrušit `account_id`; `contact_id` povinné |
| `Project/SavedQueries/active_projects.json:5`, `my_projects.json:7` | sloupec `account` → **`primary_contact`** |
| `Quote/SavedQueries/active_quotes.json:7`, `Invoice/SavedQueries/active_invoices.json:7` | sloupec `account` → `contact` |
| `Project|Quote|Invoice/FormXml/main_form.json` | upravit seznamy polí |

> **Nález 4 — u projektu se sloupec NESMÍ jmenovat `contact`.**
> `columnFields.ts:36-40` překládá alias striktně jako `X → X_id`. Pole se jmenuje
> `primary_contact_id`, takže `contact` se nepřeloží na nic a vrátí `null`. Důsledky jsou tiché:
> `GridEngine.tsx:137-145` nastaví `isFilterable: false`, sloupec přestane jít řadit i filtrovat
> a `EntityListPage.tsx:138-140` ho vyhodí z nabídky hodnot. Tím by padl přesně ten důvod,
> kvůli kterému je klient skutečným polem (rozhodnutí 4).
> Sloupec tedy **`primary_contact`**, a `projects/page.tsx:25` musí tenhle klíč vracet
> (`GridEngine.tsx:214` čte `row[col.field.name]`). U nabídky a faktury je `contact` správně.

`Account/*` a `registry.ts` se nemění. Pro `project_contacts` se entita nezakládá.

---

## 4. Frontend

| Soubor | Změna |
|---|---|
| **`accounts/[id]/page.tsx:31-33`** | **rollup filtruje projekty přes `projects.account_id`** — po zrušení sloupce každé otevření firmy skončí chybou `42703`. Projekty se nově musí hledat přes kontakty firmy, a to **nejde přes `listRecords`**: `Database.ts:6,22` umí jen rovnost (`.eq`), ne `in`. Nutné buď sáhnout na Supabase přímo (`supabase.from("projects").select("id").in("primary_contact_id", contactIds)`), nebo rozšířit `ListOptions` (sdílený engine, dotkne se všech volajících). Zároveň **přestane jít o paralelní dotazy** — projekty závisí na id kontaktů, takže `Promise.all` na `:31-33` se musí rozdělit. |
| `projects/[id]/page.tsx` | `:55-56`, `:95-98`, `:106-113` (osa), `:114-118` + `:116` (tým, profese), `:137-152`/`:178-209` (žadatel), `:221`, `:234` (popisek záložky), `:245-249`, `:298` |
| `projects/[id]/TeamPanel.tsx` | přepsat na `project_contacts`: přidat/odebrat člověka s rolí, serverové akce, načtení číselníku, **potvrzovací dialog u odebrání** (standard projektu) |
| `contacts/[id]/page.tsx` | **nově:** seznam projektů, kde kontakt figuruje |
| `contacts/page.tsx:18,25` | zrušit join na profesi (`:24` je `account` a zůstává) |
| `projects/page.tsx:19,25`, `kanban/page.tsx:14,36`, `KanbanBoard.tsx:25,57`, `project-overview/page.tsx:85,105,184` | sloupec Klient přes `primary_contact_id` |
| `quotes/page.tsx:21,29`, `invoices/page.tsx:21,29` | joiny |
| `quotes/[id]/page.tsx:46,120`, `invoices/[id]/page.tsx:48,123` | zrušit seznam firem (řádky s kontakty zůstávají) |
| `quotes/[id]/actions.ts:19,37-38`, `quotes/new/page.tsx:20` | kopie do faktury a předvyplnění |

**Panel týmu jde vlastní cestou, ne přes engine** — vzorem milníky (`MilestonesPanel.tsx`,
~400 řádků). Cena: tým nebude mít seznam, pohledy, import, export ani fulltext. Protiváhou je
ten seznam projektů na kartě kontaktu.

---

## 5. Logika, PDF, MCP, testy

**PDF a předvyplnění.** Odběratel se odvodí přes dva skoky: `invoice → contact → account`.
Mění se **tvar řádku**, ne jen dotaz — `api/invoices/[id]/pdf/route.ts:22-30` `InvoiceRow` musí mít
`contact: { …, account: {…} | null } | null` a `:126-131` číst `inv.contact?.account?.name`.
Vnořený dotaz s upřesněním na druhé úrovni nemá v projektu obdobu, takže **ověřit proti databázi,
ne předpokládat**.

> **Nález 5 — vnořený dotaz musí vytáhnout i novou adresu kontaktu, jinak §9 nepomůže.**
> `api/invoices/[id]/pdf/route.ts:73` a `api/quotes/[id]/pdf/route.ts:47` dnes berou z kontaktu jen
> `first_name, last_name, email`. Když se k nim nepřidá pět adresních polí, soukromý klient vyjde
> na dokladu **pořád bez adresy** — a nic to neohlásí: `buildAddressQuery` (`lib/mapbox.ts:19-25,36`)
> má všechny vlastnosti nepovinné, takže se zkompiluje i nad řádkem bez adresy a vrátí `null`.
> Přesně ta chyba, kvůli které §9 vznikla, by tedy prošla dál.

**Pozor i na dvojí jméno:** `invoicePdf.tsx:103-106` tiskne `customer.name`, adresu,
`customer.contactName` a e-mail. U klienta bez firmy je `name` i `contactName` tatáž osoba —
`contactName` se v tom případě musí vynechat.

Dotčeno dál: `api/quotes/[id]/pdf/route.ts:18-19,44-48,68-70`,
`lib/quotePdf.tsx:58-60,92-97` (pole `accountName` bude někdy obsahovat osobu — přejmenovat),
`lib/invoicePdf.tsx:67,101-107`.

**Předvyplnění pro sítě** — `lib/utilityPrefill.ts` se nemění, ale volající
`projects/[id]/page.tsx:197-209` ano: žadatel se nově bere z klienta a jeho firmy. U klienta bez
firmy zůstanou IČO a právní forma prázdné (u fyzické osoby správně), ale **sídlo se vezme
z adresy kontaktu** (§9), takže souhrn nevyjde prázdný.

**MCP** — `list_accounts`, `create_account`, `update_account` i `find_contact` **zůstávají**.

V `src/lib/mcp/writeTools.ts`:
- `create_project` — **`:128` smazat** (`account_id`) a u **`:129` zrušit `.optional()`**;
  `primary_contact_id` tam už je, takže „přejmenovat `:128`" by vyrobilo dvojitý klíč ve stejném
  `z.object`, a ponechané `.optional()` by znamenalo `23502` při každém volání bez kontaktu.
  Dál `:125` (popis nástroje dnes říká „založ firmu přes `create_account`" — bez opravy bude model
  posílat id firmy do pole pro kontakt) a `:156` (`columns` vrací `account_id` → jinak `42703`).
- `create_contact` (`:96-117`) a `update_contact` (`:315-341`, `columns` na `:337`) — **doplnit
  adresní pole z §9**, jinak přes AI půjde vyplnit fakturační adresa firmě, ale ne soukromé osobě.
  (`update_account:348-361` je mít za vzor, ale pozor — chybí v něm `address_country`.)

V `src/lib/mcp/readTools.ts`: `list_projects` (`:51`), `get_project_detail` (`:80`),
`list_quotes` (`:234`), `list_invoices` (`:262`) — všechny joinují `accounts(name)` na projektu.
`readTools.ts:183,289` joinují `accounts(name)` na **kontaktu** a zůstávají.
Nově případně `add_project_contact`.

**Testy.** Zpřísnění tří vazeb na povinné znamená, že **každý fixture projektu a nabídky musí
nejdřív založit kontakt**: `global-setup.ts:115-127`, `branding.spec.ts:38-45`,
`invoices.spec.ts:22-33`, `data-integrity.spec.ts:68-72`, **`email-quick-actions.spec.ts:34-38`**,
`mcp-server.spec.ts:145-153,271-292`, `project-activity-rollup.spec.ts:34-40`,
`project-location.spec.ts:44,108`, `project-overview.spec.ts:25`,
`lead-qualification.spec.ts:106-112`, `smoke.spec.ts:316-330`.
Pozor: `invoices.spec.ts:30-33` a `branding.spec.ts:43-45` zakládají nabídku **bez** `contact_id`
a `invoices.spec.ts` pak generuje fakturu → `quotes/[id]/actions.ts:31-44` zkopíruje `null` do
`NOT NULL` sloupce a spadne na `23502`.
`ares-lookup.spec.ts`, `global-search.spec.ts` ani `tenant-isolation.spec.ts` se nemění.
**Nové testy:** tým na projektu; kontakt s projektem nebo dokladem nejde smazat.

**Import** — `primary_contact_id` se stává povinným, takže „Klient" bude povinný sloupec
v excelové šabloně projektů, dohledávaný podle `„jméno příjmení"` proti všem kontaktům
(`registry.ts:18`). Jmenovci se **neslijí** — `ImportWizard.tsx:62-82` je rozliší příponou
`Jan Novák (1)` / `(2)`. Problém je jinde: ta přípona je **pořadové číslo z neseřazeného dotazu**
(`:127` nemá `.order()`, `:76-79` číslují podle pozice v poli), takže uživatel nepozná, který je
který, a mezi stažením šablony a importem se pořadí může změnit → projekt se tiše naváže na
**špatný kontakt**. Řešení: doplnit lookupům rozlišovač (název firmy nebo e-mail), ne varování.

**Veřejné a právní texty se nemění.**

---

## 6. Postup

0. **Opravit §8** — nezávislé, potřeba tak jako tak.
1. Smazat data (§6.1).
2. Migrace: zrušit tři `account_id` a `contacts.profese_id`, zpřísnit tři vazby na `restrict`
   a `NOT NULL`, **doplnit tři indexy**, založit `project_contacts` (**se systémovými sloupci**),
   upravit `qualify_lead`.
3. Metadata solution.
4. Frontend — včetně `accounts/[id]/page.tsx`, panelu týmu a seznamu projektů na kontaktu.
5. PDF, předvyplnění, MCP.
6. Přejmenování popisku číselníku `profese` (osmá verze seed funkce + backfill).
7. Seed a testy.
8. Plná verifikace + **ruční kontrola: otevřít firmu, otevřít kanban, otevřít přehled projektů,
   export do Excelu, obě PDF (jednu firmě, jednu soukromé osobě)**. Kanban a přehled projektů
   chybu **neohlásí** — `kanban/page.tsx:33` a `project-overview/page.tsx:100` polykají chybu přes
   `?? []`, takže se jen zobrazí prázdná tabule a nulové počty, a `smoke.spec.ts:55` kontroluje jen
   nadpis, takže projde. Tohle je přesně ta třída chyb, kvůli které ten ruční krok existuje.

### 6.1 Co znamená „smazat data"

- **Pořadí:** `delete from accounts` kaskáduje na projekty → doklady → položky, kontaktům jen
  vynuluje `account_id`. Projít i `contacts`, `leads`, `activities`, `bugs`, `project_templates`,
  `notifications_config`, `invoice_number_counters`.
- **`email_sync_connections.last_history_id`** — když zůstane, cron pokračuje od staré záložky
  a nikdy nebootstrapuje (`gmailSync.ts:77-88`).
- **`audit_logs`** přežijí — správně, je to historie.
- **localStorage** (`EntityListClient.tsx:90,105-117`): u **Projektu, Nabídky a Faktury** zůstane
  uložený sloupec `account`, který už žádnému pohledu neodpovídá → vykreslí se prázdný sloupec
  s hlavičkou `account` a nový Klient nebude vidět. U Kontaktu totéž s `profese`.

---

## 7. Odhad rozsahu

| Fáze | Odhad |
|---|---|
| Oprava §8 | malá diffem, **ne malá rizikem** — osmá verze seed funkce nad živými organizacemi |
| Migrace + `project_contacts` | střední |
| Metadata solution | malá |
| Frontend (panel týmu ~400 řádků, sloupce Klient, detail firmy) | **velká** |
| PDF a předvyplnění | střední (vnořený dotaz mění tvar dat) |
| MCP | malá |
| Testy a seed | **velká** — jedenáct souborů plus dvě nové sady |

Největší riziko není nález 3, ale **detail firmy** (§4, první řádek): stránka, která po migraci
přestane jít otevřít, a žádný test to nezachytí.

---

## 8. Nález nezávislý na tomhle záměru — opravit jako první

Migrace `20260913220000_add_status_reason_scoping.sql` přepsala `seed_default_option_sets` celou
a vypadly z ní čtyři bloky. Organizace založené po 13. 9. 2026 nemají číselníky
`pravni_forma`, `quote_status_reason`, `forma_uhrady`, `invoice_status_reason`.
Ověřeno: starší organizace mají 18 číselníků, **VHarch a novější 14**.

Tatáž migrace zrušila v `seed_active_inactive_reason` (`:16-25`) **obě** `on conflict` klauzule —
`(organization_id, key)` na `option_sets` i `(option_set_id, value_key)` na `option_set_values`.
Vrátit se musí obě; při obnovení jen té první spadne seed na hodnotách. A protože sloupec
`status_scope` vznikl až touhle migrací (`:13-14`), starší řádky ho mají prázdný — na hodnotách
je tedy potřeba `do update set status_scope = excluded.status_scope`, ne `do nothing`.

**Pořadí:** nejdřív idempotence, pak doplnit chybějící bloky, pak reseed.

---

## 9. Adresa odběratele — rozhodnuto

Kontakty dnes **nemají žádná adresní pole** (`init_core_schema.sql:135-149` a všechny pozdější
`alter table public.contacts`). Bez nich by soukromý klient vyšel na dokladu s nadpisem
`FAKTURA – DAŇOVÝ DOKLAD` **bez adresy i bez IČO** — `invoicePdf.tsx:101-107` adresu přeskočí,
když je `null`. A soukromá osoba stavějící dům je nejběžnější klient.

**Řešení: kontakt dostane vlastních 5 adresních polí** se stejnými názvy, jaké už používají
`accounts` a `organizations` (`address_street`, `address_house_number`, `address_city`,
`address_zip`, `address_country`). Díky té shodě je bez úprav použitelný
`buildAddressQuery` (`lib/mapbox.ts:36-41`).

**Pravidlo pro odběratele:** má-li kontakt firmu → název a adresa firmy; jinak jméno a adresa
osoby. Jedno pravidlo, dva zdroje, žádné pole navíc na dokladu.

**Volitelně:** zvážit přidání `address_city` do `contacts.search_vector`
(`20260913200000:29-36`) — u firem už v něm je, takže hledání podle obce by jinak fungovalo
nesymetricky. Není to nutné a je to přestavba generovaného sloupce včetně GIN indexu.
