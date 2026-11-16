// Stručná reference vrstvy úprav pro AI klienty (MCP nástroj describe_customization_api).
// Plná dokumentace pro lidi: docs/upravy-firmy/. Drž obojí ve shodě s types.ts.

export const CUSTOMIZATION_REFERENCE = `
# Vrstva úprav firmy — reference

Komponenta = { type, entity, key, definition }. Uložení jde do draftu; uživatelé ji uvidí až po
publikování ve studiu (Nastavení → Přizpůsobení → Publikovat) — publikuje vždy člověk.

Entity základu: Account, Contact, Lead, Project, ProjectTemplate, Activity, Quote, Invoice, Bug.
Vlastní entity: název new_PascalCase (komponenta type "entity", key = entity = název).

## type "entity" (entity = key = new_Nazev)
{ displayName, displayNamePlural, primaryFieldLabel?, description?, icon? }
Záznamy: tabulka custom_records, primární pole "name", seznam na /c/<new_Nazev>.

## type "field" (key = new_nazev_pole, malá písmena)
{ label, type: text|textarea|email|phone|url|number|currency|date|datetime|boolean|lookup|optionset,
  required?, readOnly?, description?, targetEntity? (lookup), optionSetKey? (optionset) }
Hodnota je v záznamu jako obyčejné pole (record.new_nazev_pole).

## type "form" (key = "main")
{ tabs?: [{ label, sections: [{ label, fields: [názvy polí] }] }], columns?: 1|2|3,
  events?: { onLoad?: [H], onSave?: [H], onChange?: { pole: [H] } } }   H = { script, function }
Bez tabs zůstane rozložení základu. Vlastní pole mimo tabs se přidají do sekce "Vlastní pole".

## type "view" (key = nový název, nebo název pohledu základu = úprava / {hidden:true} = skrytí)
{ label?, columns?: [{ field, label? }], defaultSort?: { field, direction }, conditions?: [{ field,
  operator: eq|neq|contains|notcontains|startswith|gt|lt, value ("$currentUser" = přihlášený) }], order? }

## type "command"
{ label, icon? (Send, Zap, Receipt, …), location: form|list, order?, confirm?,
  action: { type: "url", url ("/cesta?x={pole}&id={id}", {ids} u seznamu), newTab? }
        | { type: "script", script, function } | { type: "plugin", plugin } }

## type "script" (klient; entity = entita nebo "*" pro sdílené) — { description?, code }
Funkce (async) dostanou ctx: entity, recordId, event {type, field?, command?}, selectedIds,
ctx.form.getValue/getValues/setValue/setVisible/setRequired/setDisabled/setNotification(msg, info|warning|error)/clearNotifications,
ctx.ui.alert(msg), ctx.navigate(url), ctx.refresh(), ctx.preventSave(msg) (onSave),
ctx.api.retrieve(entity,id)/query(entity,{filter,orderBy,limit})/create(entity,values)/update(entity,id,values)/runPlugin(key, ids).
Běží v sandboxu (web worker, bez sítě, bez DOM), limit 10 s a 50 volání api.

## type "plugin" (server) — { description?, events: [beforeCreate|afterCreate|beforeUpdate|afterUpdate|beforeDelete|afterDelete|command|invoiceGenerated], order?, code }
Funkce pojmenovaná podle události, jinak run(ctx). ctx: event, entity, recordId, record, before,
input (command: {recordIds}; invoiceGenerated: {invoiceId, quoteId, itemIds}), user {id},
ctx.setValue(pole, hodnota) (before*), ctx.api.* (jako výš, bez runPlugin), console.log → Log.
throw new Error("text") zastaví operaci a text uvidí uživatel. command vrací { message?, redirect? }.
Běží v QuickJS: bez sítě, bez Node; 2 s CPU, 10 s celkem, 32 MB, 50 volání api, hloubka 3.
`.trim();
