# Začínáme — úpravy ProjektantCRM s Claudem

Pro Honzu Havlína. Nastavení zabere asi 30 minut a dělá se jednou. Potom stačí Claudovi česky
napsat, co chceš změnit.

1. [Co musíš vědět](#1-co-musíš-vědět)
2. [Co uděláš ručně](#2-co-uděláš-ručně)
3. [Co za tebe udělá Claude](#3-co-za-tebe-udělá-claude)

---

## 1. Co musíš vědět

### Dvě cesty, jak CRM měnit

| | Úprava v aplikaci | Změna kódu |
|---|---|---|
| Kde | CRM → **Nastavení → Přizpůsobení** | Claude Code na tvém počítači |
| Co | vlastní pole a tabulky, formuláře, pohledy, tlačítka, skripty, pluginy | cokoli v aplikaci |
| Pro koho | jen naše firma (VHarch) | všechny firmy |
| Schvalování | žádné, publikuješ sám a jde to vrátit | podle semaforu níž |
| Návod | [docs/upravy-firmy/](upravy-firmy/README.md) | [CONTRIBUTING.md](../CONTRIBUTING.md) |

**Začni úpravou v aplikaci, je skoro vždycky rychlejší.** Máš roli *System Customizer*, takže
Přizpůsobení vidíš. Do kódu jdi, jen když úprava firmy nestačí. Nevíš si rady? Zeptej se
Clauda, kterou cestou to udělat.

### Semafor u změn kódu

Claude každou změnu sám zařadí:

- 🟢 **Zelená** (stránky, texty, vzhled, běžné opravy): projde sama a za pár minut je na
  https://projektantcrmdev.vercel.app
- 🟠 **Oranžová** (nové tabulky a sloupce v databázi, jádro formulářů, fakturace, napojení na
  Google, knihovny): Claude ti předem vysvětlí dopad a zeptá se, jestli to nechceš probrat
  s Honzou. Projde ale bez schválení.
- 🔴 **Červená** (mazání dat nebo sloupců, přístupová práva, přihlašování, administrace všech
  firem, pravidla samotného semaforu): čeká na Honzovo schválení, GitHub mu pošle e-mail.

### Co nejde

- Měnit ostrou verzi (větev `main`). Všechno jde na DEV, na ostrou to pouští Honza.
- Pushovat napřímo do `develop`. Vždycky přes Pull Request, který za tebe udělá Claude.
- Obejít semafor. Úprava jeho pravidel je sama červená.

### Klíče (`.env.local`)

Honza ti pošle soubor `.env.local` s klíči k DEV databázi. Je v něm klíč s **plným přístupem
k celé databázi** a repo je veřejné, proto:

- nikam ho nenahrávej, nikomu ho neposílej a nefoť,
- Claude ho číst nesmí (má to zakázané) a hodnoty z něj nepatří do chatu ani do kódu,
- kdyby unikl, hned napiš Honzovi, klíč se musí vyměnit.

---

## 2. Co uděláš ručně

Tohle Claude udělat nemůže, protože jde o tvoje účty a hesla.

**GitHub**

1. Přihlas se na https://github.com jako `havlinak96` (heslo ti dá Honza).
2. Změň si heslo a zapni dvoufázové ověření: Settings → Password and authentication.
3. Přijmi pozvánku do projektu: https://github.com/sidkvik-bit/projektant-crm/invitations

**Claude Code**

4. Nainstaluj **VS Code**: https://code.visualstudio.com (výchozí volby).
5. Ve VS Code otevři Extensions (Ctrl+Shift+X), najdi **Claude Code** a nainstaluj ho.
6. Otevři Claude Code (ikona vlevo) a přihlas se svým účtem Claude.
7. Ve VS Code dej File → Open Folder a otevři složku `Dokumenty`. Sem Claude stáhne projekt.

---

## 3. Co za tebe udělá Claude

### Krok A — instalace a stažení projektu

Do Claude Code vlož celé tohle zadání:

> Nastav mi vývojové prostředí pro ProjektantCRM na Windows:
> 1. Přes `winget` nainstaluj Git, GitHub CLI a Node.js **verze 24** (ne novější, projekt
>    běží na 24; co už je nainstalované ve správné verzi, přeskoč). Pak nainstaluj pnpm
>    příkazem `npm install -g pnpm`.
> 2. Zastav se a řekni mi, ať v novém terminálu sám spustím `gh auth login`
>    (GitHub.com → HTTPS → přihlášení přes prohlížeč). Počkej, až ti napíšu, že je hotovo.
> 3. Naklonuj https://github.com/sidkvik-bit/projektant-crm do aktuální složky. Soubor
>    `.env.local` nikdy nečti ani nevytvářej. Nakonec mi řekni, ať otevřu složku
>    `projektant-crm` ve VS Code a začnu nový chat (krok B v docs/ZACINAME.md).

Claude se tě bude ptát na povolení u instalací a příkazů. Odklikni je. Program pro instalaci
(`winget`) se může zeptat ještě jednou, potvrď to. Po instalaci může být potřeba zavřít
a znovu otevřít VS Code, aby nové programy našel.

### Krok B — otevřít projekt a dokončit nastavení

1. Ve VS Code dej File → Open Folder a otevři `Dokumenty\projektant-crm`. Tohle je důležité:
   pravidla projektu (semafor, ochrana klíčů) se v Claudovi zapnou jen tehdy, když běží
   přímo ve složce projektu.
2. Vytvoř soubor s klíči: v levém panelu klikni pravým tlačítkem na prázdné místo → New File,
   pojmenuj ho přesně `.env.local` a vlož do něj obsah z odkazu od Honzy. Ulož (Ctrl+S).
3. Otevři Claude Code, začni **nový chat** a napiš:

> Dokonči nastavení projektu podle docs/ZACINAME.md, sekce „Co Claude udělá po naklonování“.

### Co Claude udělá po naklonování

1. Ověří jen to, že soubor `.env.local` existuje (`Test-Path .env.local`). Obsah nečte, má to
   v projektu zakázané. Když soubor chybí, řekne ti, ať ho vytvoříš podle kroku B.
2. Nastaví git: `git config user.name havlinak96` a `user.email` podle tvého GitHub účtu
   (`gh api user`).
3. Nainstaluje knihovny (`pnpm install`) a pustí kontroly `pnpm exec tsc --noEmit`
   a `pnpm test`. Obě mají projít.
4. Spustí aplikaci (`pnpm dev`) a řekne ti, ať otevřeš http://localhost:3000 a přihlásíš se
   svým Google účtem (tím, kterým se přihlašuješ do CRM). Uvidíš firmu VHarch s daty z DEV.
5. Krátce ti shrne [CONTRIBUTING.md](../CONTRIBUTING.md): semafor a jak jdou změny na DEV.

### Každodenní práce

Napiš Claudovi česky, co chceš, třeba: *„Na detailu projektu chci tlačítko, které vytvoří
nabídku.“* Claude pak:

1. řekne, jestli by to nešlo rychleji jako úprava v aplikaci (Přizpůsobení),
2. když jde o kód: založí větev, udělá změnu a ověří ji,
3. řekne ti barvu semaforu a u oranžové a červené vysvětlí, co změna dělá,
4. pošle Pull Request a zapne automatické sloučení.

Zelené a oranžové změny jsou za pár minut na https://projektantcrmdev.vercel.app. Červené
počkají, až je Honza schválí.
