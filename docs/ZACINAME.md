# Začínáme — úpravy ProjektantCRM s Claudem

Pro Honzu Havlína. Jednorázové nastavení, cca 30 minut. Potom stačí Claudovi česky napsat, co
chceš změnit — zbytek (větev, kontroly, Pull Request, nasazení na DEV) udělá sám.

## 1. GitHub

1. Dokonči registraci účtu `havlinak96` — ověřovací kód přišel na e-mail.
2. Změň si heslo (Settings → Password) a zapni dvoufázové ověření (Settings → Password and
   authentication). GitHub ho stejně bude chtít.
3. Přijmi pozvánku do repa: https://github.com/sidkvik-bit/projektant-crm/invitations

## 2. Programy (Windows)

Nainstaluj (všude výchozí volby):

- **Git** — https://git-scm.com/download/win
- **Node.js 24 LTS** — https://nodejs.org
- **GitHub CLI** — https://cli.github.com
- **VS Code** — https://code.visualstudio.com a v něm rozšíření **Claude Code**
  (potřebuješ předplatné Claude Pro/Max nebo účet, který ti nastaví Honza)

Pak v terminálu (PowerShell):

```powershell
gh auth login        # GitHub.com → HTTPS → Login with a web browser
corepack enable      # zapne pnpm
```

## 3. Projekt

V terminálu:

```powershell
cd $HOME\Documents
gh repo clone sidkvik-bit/projektant-crm
cd projektant-crm
code .
```

Do složky projektu ulož soubor **`.env.local`**, který ti pošle Honza (klíče k DEV prostředí —
nikdy ho necommituj ani nikomu dál neposílej; Git ho ignoruje).

Otevři Claude Code a napiš:

> Nastav mi projekt podle docs/ZACINAME.md, sekce „Co udělá Claude“.

### Co udělá Claude

1. Ověří `git --version`, `node --version` (24.x), `pnpm --version`, `gh auth status`
   a že soubor `.env.local` existuje (jen `Test-Path .env.local` — obsah nečte, viz
   CONTRIBUTING.md → Klíče).
2. Nastaví `git config user.name havlinak96` a `user.email` podle GitHub účtu (`gh api user`).
3. `pnpm install`, potom `pnpm exec tsc --noEmit` a `pnpm test` — mají projít.
4. Spustí `pnpm dev` a řekne ti, ať si otevřeš http://localhost:3000 a přihlásíš se svým
   Google účtem — uvidíš svou firmu VHarch s daty z DEV.
5. Shrne ti [CONTRIBUTING.md](../CONTRIBUTING.md) — semafor a jak jdou změny do DEV.

## 4. Každodenní práce

Napiš Claudovi, co chceš — třeba *„na detailu projektu chci tlačítko, které vytvoří nabídku
z šablony“*. Claude:

- založí větev, udělá změnu a ověří ji,
- řekne ti barvu semaforu (🟢/🟠/🔴) a u oranžové a červené vysvětlí, co to znamená,
- otevře Pull Request a zapne auto-merge.

Zelené a oranžové změny jsou za pár minut na https://projektantcrmdev.vercel.app.
Červené počkají, až je Honza schválí.

## Úpravy firmy bez zásahu do kódu

Máš roli **System Customizer**, takže v aplikaci vidíš **Nastavení → Přizpůsobení**. Tam si pro
svou firmu přidáš vlastní pole, celé vlastní tabulky, formuláře, pohledy, tlačítka, klientské
skripty a serverové pluginy. Změny se nejdřív uloží jako rozpracované, v náhledu si je
zkontroluješ a pak je publikuješ. Každou publikaci jde vrátit.

Tohle je rychlejší cesta než změna kódu a nic se při ní neschvaluje. Návod:
[docs/upravy-firmy/](upravy-firmy/README.md). Claude ti úpravy připraví i přes MCP.

Do kódu (Pull Request) jdi, jen když úprava firmy nestačí, tedy když se má změnit aplikace
pro všechny firmy.
