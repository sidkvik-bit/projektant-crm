# Tlačítka (ribbon)

Studio: **entita → Tlačítka**. Tlačítko je v liště **formuláře** (`location: "form"`, jen
u uloženého záznamu, a jen když nejsou neuložené změny) nebo **seznamu** (`location: "list"`,
pracuje s vybranými řádky).

```json
{
  "label": "Vytvořit nabídku",
  "icon": "Receipt",
  "location": "form",
  "order": 1,
  "confirm": "Založit k projektu novou nabídku?",
  "action": { "type": "plugin", "plugin": "nabidka_z_projektu" }
}
```

`confirm` zobrazí před spuštěním potvrzovací dialog. Hodí se u všeho, co něco zakládá nebo
mění.

## Akce

### Otevřít adresu: `url`

```json
{ "type": "url", "url": "https://nahlizenidokn.cuzk.cz/?parcela={parcelni_cislo}", "newTab": true }
```

- `{název_pole}` se nahradí hodnotou ze záznamu, `{id}` jeho id a v seznamu `{ids}` id
  vybraných řádků oddělenými čárkou.
- Relativní cesta (`/projects?view=my_projects`) se otevře v aplikaci, `http(s)`, `mailto:`
  a `tel:` v novém okně. Jiné adresy (např. `javascript:`) nejsou povolené.

### Klientský skript: `script`

```json
{ "type": "script", "script": "projekt", "function": "kopirujAdresu" }
```

Funkce dostane `ctx` jako v [skripty.md](skripty.md), `ctx.event.type` je `"command"`.
V seznamu jsou vybrané řádky v `ctx.selectedIds`.

### Serverový plugin: `plugin`

```json
{ "type": "plugin", "plugin": "nabidka_z_projektu" }
```

Plugin musí mít událost `command`. Dostane `ctx.input.recordIds`. Když vrátí
`{ message, redirect }`, uživatel uvidí zprávu a aplikace přejde na adresu. Viz
[pluginy.md](pluginy.md).
