# Recepty

Hotové úpravy na zkopírování. Každá je seznam komponent ve tvaru, jaký přijímá import
(Přizpůsobení → Import) i AI (`save_customization_draft`).

## Číslo zakázky na projektu, v seznamu i ve faktuře

1. Pole `Project` / `new_cislo_zakazky`: `{ "label": "Číslo zakázky", "type": "text" }`
2. Pole `Invoice` / `new_cislo_zakazky`: stejné.
3. Pohled `Project` / `active_projects` (úprava základu), přidat sloupec:

```json
{ "columns": [{ "field": "name" }, { "field": "new_cislo_zakazky", "label": "Zakázka" },
  { "field": "primary_contact", "label": "Klient" }, { "field": "status_reason", "label": "Fáze" },
  { "field": "deadline", "label": "Deadline" }, { "field": "owner", "label": "Vlastník" }] }
```

4. Plugin `Invoice` / `zakazka_do_faktury`, události `["invoiceGenerated"]`:

```js
async function invoiceGenerated(ctx) {
  const invoice = await ctx.api.retrieve("Invoice", ctx.input.invoiceId);
  const project = await ctx.api.retrieve("Project", invoice.project_id);
  await ctx.api.update("Invoice", invoice.id, { new_cislo_zakazky: project.new_cislo_zakazky });
}
```

## Tlačítko „Vytvořit nabídku“ na projektu

Plugin `Project` / `nabidka_z_projektu`, události `["command"]`:

```js
async function command(ctx) {
  const project = await ctx.api.retrieve("Project", ctx.input.recordIds[0]);
  const quote = await ctx.api.create("Quote", {
    name: `Nabídka — ${project.name}`,
    project_id: project.id,
    contact_id: project.primary_contact_id,
  });
  return { message: "Nabídka založena", redirect: `/quotes/${quote.id}` };
}
```

Tlačítko `Project` / `vytvorit_nabidku`:

```json
{ "label": "Vytvořit nabídku", "icon": "Receipt", "location": "form",
  "confirm": "Založit k projektu novou nabídku?",
  "action": { "type": "plugin", "plugin": "nabidka_z_projektu" } }
```

## Kontrola IČO u firmy

Plugin `Account` / `kontrola_ico`, události `["beforeCreate", "beforeUpdate"]`:

```js
function run(ctx) {
  const ico = String(ctx.record.ico ?? "").replace(/\s/g, "");
  if (!ico) return;
  if (!/^\d{8}$/.test(ico)) throw new Error("IČO musí mít 8 číslic.");
  const sum = [...ico.slice(0, 7)].reduce((s, d, i) => s + Number(d) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  if (check !== Number(ico[7])) throw new Error("IČO nemá platný kontrolní součet.");
  ctx.setValue("ico", ico);
}
```

## Upozornění na projekt bez rozpočtu

Skript `Project` / `projekt`:

```js
async function onLoad(ctx) {
  if (ctx.recordId && !ctx.form.getValue("budget")) {
    ctx.form.setNotification("Projekt nemá vyplněný rozpočet.", "warning");
  }
}
```

Formulář `Project` / `main`:
`{ "events": { "onLoad": [{ "script": "projekt", "function": "onLoad" }] } }`

## Vlastní entita „Stavební deník“ napojená na projekt

1. Entita `new_StavebniDenik`:
   `{ "displayName": "Zápis do deníku", "displayNamePlural": "Stavební deník", "primaryFieldLabel": "Zápis", "icon": "ClipboardList" }`
2. Pole `new_StavebniDenik` / `new_projekt`:
   `{ "label": "Projekt", "type": "lookup", "targetEntity": "Project", "required": true }`
3. Pole `new_StavebniDenik` / `new_datum`: `{ "label": "Datum", "type": "date" }`
4. Pohled `new_StavebniDenik` / `podle_projektu`:
   `{ "label": "Podle projektu", "columns": [{ "field": "new_datum" }, { "field": "name" }, { "field": "new_projekt" }], "defaultSort": { "field": "new_datum", "direction": "desc" } }`
5. Tlačítko na projektu, které otevře jeho deník (seznam s filtrem):
   `{ "label": "Stavební deník", "icon": "ClipboardList", "location": "form", "action": { "type": "url", "url": "/c/new_StavebniDenik?cf_new_projekt=eq|{id}" } }`
