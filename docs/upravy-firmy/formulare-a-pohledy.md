# Formuláře a pohledy

## Formulář

Každá entita má jeden hlavní formulář (komponenta `form`, klíč `main`). Studio: **entita →
Formulář**.

- **Přidat jen události:** rozložení zůstane podle základu, jen napojíš skripty.
- **Upravit rozložení:** zkopíruje rozložení základu, které pak přeskládáš.

```json
{
  "columns": 2,
  "tabs": [
    { "label": "Obecné", "sections": [
      { "label": "Projekt", "fields": ["name", "new_cislo_zakazky", "primary_contact_id", "deadline"] },
      { "label": "Stav", "fields": ["status", "status_reason_id", "owner_id"] }
    ] }
  ],
  "events": {
    "onLoad":   [{ "script": "projekt", "function": "onLoad" }],
    "onSave":   [{ "script": "projekt", "function": "onSave" }],
    "onChange": { "deadline": [{ "script": "projekt", "function": "kontrolaTerminu" }] }
  }
}
```

- `fields` jsou systémové názvy polí entity a vlastních polí, plus `status`,
  `status_reason_id` a `owner_id`. Seznam polí základu najdeš ve studiu (Pole → Pole
  základního řešení).
- Vlastní pole, které v `tabs` není, se přidá do sekce *Vlastní pole*.
- `columns`: 1, 2 nebo 3 sloupce polí v sekci.
- `events`: viz [skripty.md](skripty.md). `onChange` reaguje jen na změnu od uživatele, ne na
  změnu ze skriptu.

Některé detaily (projekt, nabídka, faktura) mají kromě formuláře ještě panely a záložky
psané přímo v aplikaci (milníky, položky, parcely…). Přepis formuláře mění jen formulář, ne
tyto panely.

## Pohledy (seznamy)

Studio: **entita → Pohledy**. U pohledu základu jde:

- **Upravit:** komponenta se stejným klíčem jako pohled (např. `active_projects`). Uvedené
  vlastnosti přepíšou ty v základu.
- **Skrýt:** `{ "hidden": true }`.

Nový pohled má vlastní klíč:

```json
{
  "label": "Po termínu",
  "columns": [
    { "field": "name" },
    { "field": "deadline", "label": "Termín" },
    { "field": "new_cislo_zakazky", "label": "Zakázka" },
    { "field": "owner", "label": "Vlastník" }
  ],
  "defaultSort": { "field": "deadline", "direction": "asc" },
  "conditions": [
    { "field": "status", "operator": "eq", "value": "active" },
    { "field": "deadline", "operator": "lt", "value": "2026-12-31" },
    { "field": "owner_id", "operator": "eq", "value": "$currentUser" }
  ],
  "order": 1
}
```

- Operátory: `eq`, `neq`, `contains`, `notcontains`, `startswith`, `gt`, `lt`. Podmínky platí
  všechny současně.
- `$currentUser` = přihlášený uživatel (pohledy „Moje …“).
- `order` určuje pořadí v přepínači. Bez něj jsou vlastní pohledy za pohledy základu.
- `overflow: true` schová pohled do nabídky *Další ▾*.
- Sloupce `owner` a `status_reason` se zobrazí jako jméno a text. Sloupce základu jako
  `primary_contact` doplňuje stránka sama, ve vlastních pohledech fungují stejně.
