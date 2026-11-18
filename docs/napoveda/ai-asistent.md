# AI asistent

ProjektantCRM se připojí do AI nástroje, který už používáš (Claude, Cursor, Gemini CLI). Pak se
na zakázky ptáš běžnou řečí a AI za tebe může i zapisovat.

## Co AI umí

- **Odpovídat na otázky**: „Co mi tento týden hoří?“, „Jaké nabídky čekají na odpověď?“,
  „Kolik jsme letos fakturovali?“
- **Zapisovat na vyžádání**: skoro všechno, co jde ve webu. Posunout fázi projektu, odškrtnout
  milník, kvalifikovat zájemce, připravit nabídku s položkami, označit fakturu jako uhrazenou,
  přidat člověka do týmu projektu, nastavit upozornění, doplnit číselník nebo vlastní pole.
- **Připravit fakturu**: AI ti ukáže položky a součet a pošle odkaz. Faktura vznikne až po
  tvém kliknutí v CRM, protože dostane číslo z řady.
- **Upravit CRM pro vaši firmu**: „Přidej na projekty pole Číslo zakázky a tlačítko, které založí
  nabídku.“ AI úpravu připraví, ukáže ti, co se změní, a po tvém souhlasu ji publikuje. Každou
  publikaci jde vrátit. Viz [Úpravy firmy](README.md).
- **Připravit smazání**: AI ti ukáže, co přesně by zmizelo, a pošle odkaz. Smaže se až po tvém
  kliknutí v CRM.

## Jak ho připojit

1. V CRM otevři **Nastavení → MCP - AI**.
2. **Claude na webu (claude.ai):** přidej vlastní konektor s adresou ze stránky a přihlas se.
   Token nepotřebuješ.
3. **Claude Desktop, Cursor, Gemini CLI:** vygeneruj token a zkopíruj připravený blok do
   nastavení svého nástroje.

## Bezpečnost

- AI jedná **tvým jménem**. Vidí a změní jen to, co bys mohl ty ve webu. Data jiných firem
  jsou mimo dosah.
- **AI sama nic nesmaže.** Smazání vždy potvrzuješ ty kliknutím v CRM, kde vidíš i navázané
  záznamy, které zmizí s ním.
- Každá změna se zapíše do historie i s původní hodnotou.
- **Role, pozvánky, bankovní účet, tokeny a napojení na Google** jdou změnit jen ve webu.
  Do CRM chodí i cizí text (třeba e-maily od klientů) a AI by ho mohla brát jako pokyn.
- Za AI platíš ve svém nástroji. CRM jen poskytuje data.

## Doporučení

- Ptej se konkrétně a jmenuj zakázku nebo klienta.
- U zápisů si přečti, co AI hlásí, že změnila. Zpětně to najdeš v historii záznamu.
- Token ber jako heslo. Když unikne, v Nastavení → MCP - AI ho odvolej.
