# Serverové pluginy

Kód v JavaScriptu, který běží **na serveru** při práci se záznamy: validace, dopočty,
automatické zakládání navazujících záznamů a akce z tlačítek. Odpovídá D365 Plugins.

Studio: **entita → Pluginy**. Plugin patří k entitě, reaguje na vybrané **události** a jeho
kód definuje funkci pojmenovanou podle události (`beforeCreate`…) nebo obecnou `run(ctx)`.

```js
async function beforeCreate(ctx) {
  // Validace: chyba zastaví uložení a uživatel uvidí přesně tenhle text.
  if (!ctx.record.ico && ctx.record.odberatel_je_firma) {
    throw new Error("U firmy vyplňte IČO.");
  }
  // Dopočet: hodnoty jdou rovnou do ukládaného záznamu.
  ctx.setValue("new_kod", String(ctx.record.name).slice(0, 3).toUpperCase());
}

async function afterCreate(ctx) {
  await ctx.api.create("Activity", {
    entity_type: ctx.entity,
    entity_id: ctx.recordId,
    subject: "Založeno automaticky",
  });
}
```

## Události

| Událost | Kdy | Co jde |
|---|---|---|
| `beforeCreate` | před založením | `ctx.setValue`, `throw` zastaví založení |
| `afterCreate` | po založení | navazující záznamy (`ctx.api`) |
| `beforeUpdate` | před uložením změn | `ctx.setValue`, `throw` zastaví uložení. `ctx.before` = stav před změnou |
| `afterUpdate` | po uložení změn | navazující změny |
| `beforeDelete` | před smazáním | `throw` smazání zastaví |
| `afterDelete` | po smazání | `ctx.before` = smazaný záznam |
| `command` | tlačítko s akcí `plugin` | `ctx.input.recordIds`. Návratová hodnota `{ message?, redirect? }` |
| `invoiceGenerated` | po vystavení faktury z nabídky (entita `Invoice`) | `ctx.input = { invoiceId, quoteId, itemIds }` |

Pluginy se spouští při uložení z formulářů, z tlačítek, z `ctx.api` a z MCP (AI). **Nespouští
se** při hromadném importu z Excelu. Při hromadném mazání ze seznamu se spustí pro každý řádek.

Chyba v `after*` už uložení nevrátí, záznam je uložený. Validace proto patří do `before*`.

## ctx

| | |
|---|---|
| `ctx.event`, `ctx.entity`, `ctx.recordId` | Událost, entita, id záznamu. |
| `ctx.record` | Hodnoty záznamu: u `before*` to, co se ukládá (u update sloučené se stávajícím stavem), u `after*` uložený záznam. Vlastní pole jako obyčejná pole. |
| `ctx.before` | Stav před změnou (update, delete). |
| `ctx.input` | Data události (`command`, `invoiceGenerated`). |
| `ctx.user.id` | Kdo akci spustil. |
| `ctx.setValue(pole, hodnota)` | Jen `before*`: změní ukládanou hodnotu. |
| `ctx.api.retrieve / query / create / update` | Stejné jako v [klientských skriptech](skripty.md). Běží pod právy uživatele, který akci spustil. |
| `console.log(…)` | Zapíše se do **Přizpůsobení → Log skriptů**. Tam jsou i chyby a doba běhu. |

Víc pluginů na stejné události běží podle `order` (nižší dřív). Změny z `ctx.setValue` vidí
další plugin v `ctx.record`.

## Sandbox a limity

Plugin běží v **QuickJS**, samostatném JS enginu uvnitř serveru:

- nemá Node, soubory, proměnné prostředí, klíče ani **síť**,
- **2 s** čistého výpočtu, **10 s** celkem, **32 MB** paměti, **50 volání `ctx.api`** na běh,
- plugin, který přes `ctx.api` zapíše jiný záznam, spustí jeho pluginy. Zanoření je omezené na
  3 úrovně, aby se pluginy nezacyklily.

Při překročení limitu se operace zastaví s chybou a zapíše se do logu.

## Faktura

Číselná řada, výpočet DPH a QR platba jsou pevné jádro aplikace. Plugin na
`invoiceGenerated` fakturu po vystavení doplní:

```js
async function invoiceGenerated(ctx) {
  const quote = await ctx.api.retrieve("Quote", ctx.input.quoteId);
  await ctx.api.update("Invoice", ctx.input.invoiceId, {
    note: `Fakturujeme dle nabídky ${quote.number}. Děkujeme za spolupráci.`,
    new_zakazka: quote.new_zakazka,
  });
}
```

Když tento plugin skončí chybou, faktura už existuje. Uživatel dostane upozornění a chyba se
zapíše do logu.
