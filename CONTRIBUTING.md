# Jak přispívat do ProjektantCRM

Tenhle soubor čte člověk i Claude. Platí pro každého, kdo **není vlastník repa** (`sidkvik-bit`).
Vlastník pushuje do `develop` přímo a semafor si lokálně vypíná.

## Větve a nasazení

| Větev | Kdo do ní píše | Kam se nasadí |
|---|---|---|
| `main` | jen Honza | produkce (zatím neaktivní) |
| `develop` | jen přes Pull Request | DEV — https://projektantcrmdev.vercel.app a DEV databáze |
| `zmena/<popis>` | ty | nikam (Vercel z ní udělá náhledové nasazení) |

Do `develop` ani `main` se nedá pushnout napřímo — GitHub to odmítne. Každá změna jde takhle:

1. `git switch develop && git pull` → `git switch -c zmena/<kratky-popis>`
2. Udělej změnu. Ověř ji (níž).
3. `git push -u origin HEAD` → `gh pr create --base develop --fill`
4. `gh pr merge --auto --squash` — PR se sám zmerguje, jakmile projdou kontroly.

Po merge do `develop` se aplikace sama nasadí na DEV (Vercel) a nové migrace se samy aplikují
na DEV databázi (workflow `db-migrate`).

## Semafor

Každá změna dostane barvu podle toho, na co sahá. Pravidla jsou v
[.github/risk/rules.mjs](.github/risk/rules.mjs); lokálně si barvu větve zjistíš příkazem
`node .github/risk/local.mjs`.

- 🟢 **Zelená** — stránky, komponenty, texty, metadata entit (`src/solutions/`), testy.
  Projde sama.
- 🟠 **Oranžová** — nová migrace, jádro formulářů a pohledů (`src/engine/`), fakturace a DPH,
  MCP, API, závislosti. Projde sama, ale **Claude ti předem vysvětlí dopad** a zeptá se, jestli to
  nechceš nejdřív probrat s Honzou.
- 🔴 **Červená** — mazání dat a sloupců v migracích, `security definer`, pravidla přístupu (RLS),
  přihlašování, admin klient, platformová administrace, úprava už aplikované migrace a pojistky
  samotné (`.github/`, `.claude/settings.json`, `.claude/hooks/`). **PR čeká na schválení od
  Honzy** — GitHub mu pošle e-mail. Po schválení se PR zmerguje sám.

Kontrola `risk-gate` u PR napíše komentář s barvou a důvody. U červené změny je normální, že
check svítí červeně, dokud Honza neschválí.

### Pokyny pro Clauda

- Před první úpravou zjisti, jakou barvu bude změna mít. Hook `.claude/hooks/risk-gate.mjs` ti
  to připomene u každého souboru.
- **Oranžová:** jednou a srozumitelně česky vysvětli, co změna udělá a co může rozbít (ne jak
  je naprogramovaná). Zeptej se, jestli pokračovat, nebo to nejdřív probrat s Honzou. Pak pracuj.
- **Červená:** zastav se. Vysvětli dopad a že PR počká na Honzu. Nabídni cestu bez červeného
  zásahu, pokud existuje — často jde o věc, kterou si firma nastaví ve
  [vrstvě úprav](docs/upravy-firmy/README.md) přímo v aplikaci, bez zásahu do kódu.
- Nikdy neobcházej semafor (úprava pravidel, hooků, workflow, CODEOWNERS) — i to je červená.
- Migrace piš podle skillu `supabase-migration`. Do už aplikované migrace nesahej, oprav ji novou.

## Ověření před PR

Totéž, co pustí CI (check `ci`):

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
node --test .github/risk/classify.test.mjs
```

E2E testy (`pnpm e2e`) v CI neběží — pusť je lokálně u změn, které mění chování stránek.

## Co dělat, když…

- **CI spadne** — oprav to v té samé větvi a pushni znovu, PR se aktualizuje.
- **Konflikt s `develop`** — `git pull origin develop` ve své větvi, vyřeš, pushni.
- **Červená změna, Honza nemá čas** — rozděl PR: zelenou/oranžovou část pošli zvlášť, ať neblokuje.
