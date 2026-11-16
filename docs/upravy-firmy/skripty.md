# Klientské skripty

Kód v JavaScriptu, který běží **v prohlížeči uživatele** a řídí formulář: předvyplní,
skryje, zpřístupní, upozorní, zkontroluje před uložením nebo dotáhne data. Odpovídá D365 Form
Scripts.

Studio: **entita → Skripty** (nebo *Sdílené skripty* na přehledu pro funkce používané u více
entit). Skript je soubor funkcí a na události je napojíš ve [formuláři](formulare-a-pohledy.md)
(`events`) nebo na [tlačítko](tlacitka.md).

```js
async function onLoad(ctx) {
  if (!ctx.recordId) ctx.form.setValue("datum_zahajeni", new Date().toISOString().slice(0, 10));
  ctx.form.setVisible("new_duvod_zruseni", ctx.form.getValue("status") === "inactive");
}

async function kontrolaTerminu(ctx) {
  const deadline = ctx.form.getValue("deadline");
  ctx.form.clearNotifications();
  if (deadline && deadline < new Date().toISOString().slice(0, 10)) {
    ctx.form.setNotification("Termín je v minulosti.", "warning");
  }
}

async function onSave(ctx) {
  if (ctx.form.getValue("budget") > 1000000 && !ctx.form.getValue("new_schvalil")) {
    ctx.preventSave("Projekt nad 1 mil. Kč musí mít vyplněno, kdo ho schválil.");
  }
}
```

## ctx

| | |
|---|---|
| `ctx.entity`, `ctx.recordId` | Entita a id záznamu (`null` u nového). |
| `ctx.event` | `{ type: "onLoad" \| "onChange" \| "onSave" \| "command", field?, command? }` |
| `ctx.selectedIds` | Tlačítko v seznamu: id vybraných řádků. |
| `ctx.form.getValue(pole)` / `getValues()` | Hodnota pole / všech polí (aktuální stav formuláře). |
| `ctx.form.setValue(pole, hodnota)` | Nastaví pole (formulář bude „neuložený“). Nespouští `onChange`. |
| `ctx.form.setVisible(pole, bool)` | Skryje / zobrazí pole. |
| `ctx.form.setRequired(pole, bool)` | Povinnost navíc. Zkontroluje se při uložení. |
| `ctx.form.setDisabled(pole, bool)` | Jen pro čtení. |
| `ctx.form.setNotification(text, "info" \| "warning" \| "error")` | Upozornění nad formulářem. `clearNotifications()` je smaže. |
| `ctx.ui.alert(text)` | Krátká zpráva v rohu obrazovky. |
| `ctx.navigate(url)` | Přechod v aplikaci (`/…`) nebo nové okno (`https://…`). |
| `ctx.refresh()` | Znovu načte stránku ze serveru. |
| `ctx.preventSave(text)` | Jen v `onSave`: zastaví uložení s hláškou. |
| `ctx.api.retrieve(entita, id)` | Načte záznam (i s vlastními poli). |
| `ctx.api.query(entita, { filter, orderBy, limit })` | Seznam záznamů: `filter` jsou rovnosti `{ pole: hodnota }`, `null` = prázdné; `orderBy: { field, direction }`; `limit` max. 500 (výchozí 50). |
| `ctx.api.create(entita, hodnoty)` / `update(entita, id, hodnoty)` | Založí / upraví záznam. Proběhnou při tom pluginy. |
| `ctx.api.runPlugin(klíč, ids?)` | Spustí plugin s událostí `command`. |

Všechno, co skript s formulářem udělá, se promítne až po doběhnutí funkce. Funkce můžou být
`async` a čekat na `ctx.api`.

## Bezpečnost a limity

Skript běží ve **web workeru uvnitř izolovaného rámu** (sandbox):

- nevidí stránku, cookies, přihlášení ani úložiště prohlížeče,
- **nemá síť**: `fetch` a načítání obrázků nebo skriptů jsou zakázané. Data bere jen přes
  `ctx.api`, a to pod právy přihlášeného uživatele,
- má limit **10 s** a **50 volání `ctx.api`** na jedno spuštění. Zaseknutý skript se ukončí.

`console.log` jde do konzole prohlížeče (F12, filtr podle názvu skriptu). Chyba ve skriptu se
ukáže uživateli jako hláška a formulář funguje dál.
