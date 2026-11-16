# Úpravy firmy (Přizpůsobení)

Každá firma si může ProjektantCRM upravit pro sebe, aniž by sahala do kódu aplikace: přidat
vlastní pole a celé vlastní tabulky (entity), přeskládat formuláře, přidat pohledy a tlačítka
a naprogramovat chování ve formulářích (klientské skripty) i na serveru (pluginy).

Úpravy fungují jako **vlastní větev nad aplikací**. Aplikace (základní řešení) je pro všechny
firmy stejná a vyvíjí se dál. Úpravy firmy leží nad ní a jsou jen její. Když se základ změní,
firma změnu dostane automaticky a její úpravy zůstanou.

Najdeš je v **Nastavení → Přizpůsobení**. Vidí je jen uživatelé s rolí **System Customizer**
(a Platform Superadmin). Roli přiděluje Honza v Admin → Uživatelé a role.

## Jak to funguje

| Pojem | Co to je |
|---|---|
| **Komponenta** | Jedna úprava: pole, entita, formulář, pohled, tlačítko, skript, plugin. Má typ, entitu, ke které patří, a klíč. |
| **Rozpracovaná změna** (draft) | Co jsi uložil ve studiu. Ostatní uživatelé ji nevidí. |
| **Náhled** | Přepínač *Náhled změn*: v aplikaci vidíš i rozpracované změny (jen ty, nahoře je žlutá lišta). |
| **Publikování** | *Publikovat* převede všechny rozpracované změny najednou do ostrého provozu. Uvidíš přesně, co se změní (před → po). |
| **Historie** | Každé publikování má číslo, popis a uložený předchozí stav. **Vrátit** připraví návrat jako novou rozpracovanou změnu. |
| **Export / Import** | Celé publikované úpravy jako jeden JSON soubor. Slouží jako záloha, přenos do jiné firmy nebo verze v gitu. Import vždy přijde jako rozpracovaná změna. |

Postup je vždy stejný: **uprav → zkontroluj v náhledu → publikuj**. Když se něco pokazí:
**Historie → Vrátit → Publikovat**.

## Co jde upravit

| Typ | Návod |
|---|---|
| Vlastní pole na kterékoli entitě, vlastní entity | [pole-a-entity.md](pole-a-entity.md) |
| Rozložení formuláře, pohledy (seznamy) | [formulare-a-pohledy.md](formulare-a-pohledy.md) |
| Tlačítka v liště formuláře a seznamu | [tlacitka.md](tlacitka.md) |
| Klientské skripty (chování formuláře) | [skripty.md](skripty.md) |
| Serverové pluginy (validace, dopočty, automatizace, faktura) | [pluginy.md](pluginy.md) |
| Hotové recepty | [priklady.md](priklady.md) |

Entity základu: `Account` (Firmy), `Contact` (Kontakty), `Lead` (Zájemci), `Project`
(Projekty), `ProjectTemplate` (Šablony projektů), `Activity` (Aktivity), `Quote` (Nabídky),
`Invoice` (Faktury), `Bug` (Bugy). Vlastní entity se jmenují `new_Nazev`.

## Co úpravy nesmí (a proč)

Úpravy můžou téměř cokoli uvnitř vlastní firmy. Pevné hranice jsou jen tyto:

- **Data jiné firmy.** Skripty i pluginy běží vždy pod přihlášeným uživatelem a databáze jim
  cizí data nevydá (RLS).
- **Přihlašování, role, oprávnění, příslušnost k firmě, audit log.** Úpravou nejdou změnit.
- **Struktura databáze.** Vlastní pole a entity nevytváří nové sloupce ani tabulky. Ukládají se
  do připravených míst, takže úprava jedné firmy nemůže rozbít ostatní.
- **Kód na serveru mimo sandbox.** Pluginy běží v izolovaném JS enginu bez přístupu
  k serveru, souborům, klíčům a síti. Klientské skripty běží v izolovaném rámu prohlížeče bez
  přístupu ke stránce, cookies a síti.
- **Mazání dat ze skriptů a pluginů.** API umí číst, zakládat a upravovat, ale ne mazat.
- **Jádro fakturace.** Číselná řada, výpočet DPH a QR platba zůstávají pevné, aby doklady
  seděly. Pluginem jde fakturu po vygenerování doplnit (viz [pluginy.md](pluginy.md)).

Potřebuješ něco za touto hranicí? To je změna aplikace, ne úprava firmy. Popiš ji Honzovi,
nebo ji připrav jako změnu kódu podle [CONTRIBUTING.md](../../CONTRIBUTING.md).

## S pomocí AI

Přes MCP (Nastavení → MCP - AI) umí Claude úpravy připravit za tebe. Nástroje:

- `describe_customization_api`: reference všech tvarů a API.
- `list_customizations`: co firma má.
- `save_customization_draft`: uloží rozpracovanou změnu.

Publikuješ vždy ty ve studiu. AI publikovat ani mazat neumí.

Příklad zadání: *„Přidej na projekty pole Číslo zakázky a tlačítko, které z projektu založí
nabídku.“*
