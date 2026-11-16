# Vlastní pole a vlastní entity

## Vlastní pole

Studio: **Přizpůsobení → entita → Pole → Nové pole**.

| Vlastnost | Popis |
|---|---|
| Popisek | Co uvidí uživatelé. |
| Systémový název | `new_…`, malá písmena bez diakritiky (vyplní se z popisku). Po vytvoření nejde změnit, hodnoty jsou uložené pod ním. |
| Typ | `text`, `textarea`, `email`, `phone`, `url`, `number`, `currency`, `date`, `datetime`, `boolean`, `lookup` (odkaz na záznam), `optionset` (výběr z číselníku). |
| Cílová entita | Jen u lookupu. Kterákoli entita včetně vlastních a `User`. |
| Číselník | Jen u výběru. Číselník založíš v Nastavení → Hodnoty číselníků. |
| Povinné / Jen pro čtení | Platí ve formuláři. |

Nové pole se samo objeví ve formuláři v sekci **Vlastní pole**, pokud ho v [úpravě
formuláře](formulare-a-pohledy.md) nezařadíš jinam. Do seznamu ho přidáš jako sloupec pohledu,
nebo si ho uživatel zapne sám přes *Sloupce*. Filtrovat a řadit jde jako u každého jiného pole.

Ve skriptech a pluginech je hodnota obyčejné pole záznamu, např. `ctx.record.new_cislo_zakazky`.
Import z Excelu zatím zná jen pole základu.

**Smazání pole** ho skryje. Hodnoty v záznamech zůstanou, takže po obnovení pole se zase
ukážou.

### Definice (JSON pro AI/import)

```json
{ "type": "field", "entity": "Project", "key": "new_cislo_zakazky",
  "definition": { "label": "Číslo zakázky", "type": "text", "required": false } }
```

## Vlastní entity

Vlastní tabulka firmy, například *Zakázky*, *Stavební deník* nebo *Revize*. Studio:
**Přizpůsobení → Nová entita**.

- Systémový název `new_PascalCase` (např. `new_StavebniDenik`).
- Dostane položku v menu (skupina *Vlastní entity*), seznam s pohledy Aktivní/Neaktivní/Vše,
  formulář, stav, důvod stavu, vlastníka a historii aktivit.
- Hlavní pole se jmenuje `name`, jeho popisek si nastavíš (např. „Číslo zápisu“). Další pole
  přidáš jako u jakékoli entity.
- Na vlastní entitu můžou odkazovat lookupy z jiných entit, např. projekt má pole Zakázka.
- Adresa v aplikaci je `/c/new_Nazev`.

```json
{ "type": "entity", "entity": "new_Zakazka", "key": "new_Zakazka",
  "definition": { "displayName": "Zakázka", "displayNamePlural": "Zakázky",
                  "primaryFieldLabel": "Číslo zakázky", "icon": "Hammer",
                  "description": "Zakázky od generálních dodavatelů" } }
```

Ikony: Archive, Bell, Box, Briefcase, Calculator, Calendar, Check, ClipboardList, Copy,
Download, ExternalLink, File, FileText, Flag, Hammer, Heart, Home, Link, List, Mail, Map,
MapPin, Phone, Play, Plus, Printer, Receipt, RefreshCw, Ruler, Send, Settings, Star, Tag, Truck,
Upload, User, Users, Wrench, Zap.
