import { describe, expect, it } from "vitest";
import type { EntityDefinition, FormDefinition, ViewDefinition } from "@/engine/types";
import {
  commandsFor,
  customEntityDefinition,
  CustomizationSet,
  defaultCustomForm,
  effectiveEntity,
  effectiveForm,
  effectiveViews,
  pluginsFor,
  scriptsFor,
} from "./merge";
import type { Component } from "./types";

const project: EntityDefinition = {
  name: "Project",
  table: "projects",
  displayName: "Projekt",
  displayNamePlural: "Projekty",
  primaryField: "name",
  statusReasonOptionSetKey: "project_status_reason",
  fields: [
    { name: "name", label: "Název", type: "text", required: true },
    { name: "deadline", label: "Deadline", type: "date" },
  ],
};

const baseForm: FormDefinition = {
  entity: "Project",
  tabs: [{ label: "Obecné", sections: [{ label: "Základ", fields: ["name", "deadline"] }] }],
};

const baseViews: ViewDefinition[] = [
  { entity: "Project", name: "active_projects", label: "Aktivní", columns: [{ field: "name" }] },
  { entity: "Project", name: "my_projects", label: "Moje", columns: [{ field: "name" }] },
];

const set = (...components: Component[]) => new CustomizationSet(components);
const field = (entity: string, key: string, label = key): Component => ({
  type: "field",
  entity,
  key,
  definition: { label, type: "text" },
});

describe("effectiveEntity", () => {
  it("přidá vlastní pole za pole základu", () => {
    const result = effectiveEntity(project, set(field("Project", "new_cislo", "Číslo zakázky")));
    expect(result.fields.map((f) => f.name)).toEqual(["name", "deadline", "new_cislo"]);
    expect(result.fields[2].label).toBe("Číslo zakázky");
  });

  it("bez úprav vrátí stejný objekt a pole jiné entity ignoruje", () => {
    expect(effectiveEntity(project, set(field("Lead", "new_x")))).toBe(project);
  });
});

describe("effectiveForm", () => {
  it("nová vlastní pole bez přepisu formuláře přidá do sekce Vlastní pole", () => {
    const entity = effectiveEntity(project, set(field("Project", "new_cislo")));
    const form = effectiveForm(baseForm, entity, set(field("Project", "new_cislo")));
    expect(form.tabs[0].sections.at(-1)).toEqual({ label: "Vlastní pole", fields: ["new_cislo"] });
  });

  it("přepis rozložení nahradí taby a neznámá pole vynechá", () => {
    const customizations = set(field("Project", "new_cislo"), {
      type: "form",
      entity: "Project",
      key: "main",
      definition: {
        tabs: [{ label: "Moje", sections: [{ label: "A", fields: ["new_cislo", "name", "new_smazane"] }] }],
        columns: 1,
      },
    });
    const form = effectiveForm(baseForm, effectiveEntity(project, customizations), customizations);
    expect(form.columns).toBe(1);
    expect(form.tabs).toEqual([{ label: "Moje", sections: [{ label: "A", fields: ["new_cislo", "name"] }] }]);
  });
});

describe("effectiveViews", () => {
  it("skryje, upraví a přidá pohledy; výchozí zůstane první", () => {
    const customizations = set(
      { type: "view", entity: "Project", key: "my_projects", definition: { hidden: true } },
      { type: "view", entity: "Project", key: "active_projects", definition: { label: "Běžící" } },
      {
        type: "view",
        entity: "Project",
        key: "po_terminu",
        definition: { label: "Po termínu", conditions: [{ field: "deadline", operator: "lt", value: "2026-01-01" }] },
      },
    );
    const views = effectiveViews(baseViews, project, customizations);
    expect(views.map((v) => [v.name, v.label])).toEqual([
      ["active_projects", "Běžící"],
      ["po_terminu", "Po termínu"],
    ]);
    expect(views[1].conditions).toHaveLength(1);
  });
});

describe("vlastní entita", () => {
  const customizations = set(
    {
      type: "entity",
      entity: "new_Zakazka",
      key: "new_Zakazka",
      definition: { displayName: "Zakázka", displayNamePlural: "Zakázky", primaryFieldLabel: "Číslo" },
    },
    field("new_Zakazka", "new_misto"),
  );

  it("má primární pole name + vlastní pole a sdílenou tabulku", () => {
    const entity = customEntityDefinition(customizations.find("entity", "new_Zakazka", "new_Zakazka")!, customizations);
    expect(entity.table).toBe("custom_records");
    expect(entity.fields.map((f) => f.name)).toEqual(["name", "new_misto"]);
    expect(entity.fields[0].label).toBe("Číslo");
    expect(defaultCustomForm(entity).tabs[0].sections[0].fields).toEqual(["name", "new_misto"]);
  });
});

describe("tlačítka, pluginy, skripty", () => {
  const customizations = set(
    { type: "command", entity: "Quote", key: "b", definition: { label: "B", location: "form", order: 2, action: { type: "url", url: "/x" } } },
    { type: "command", entity: "Quote", key: "a", definition: { label: "A", location: "form", order: 1, action: { type: "url", url: "/y" } } },
    { type: "command", entity: "Quote", key: "c", definition: { label: "C", location: "list", action: { type: "url", url: "/z" } } },
    { type: "plugin", entity: "Quote", key: "p2", definition: { events: ["beforeCreate"], order: 2, code: "" } },
    { type: "plugin", entity: "Quote", key: "p1", definition: { events: ["beforeCreate", "afterCreate"], order: 1, code: "" } },
    { type: "script", entity: "*", key: "shared", definition: { code: "s" } },
    { type: "script", entity: "Quote", key: "own", definition: { code: "o" } },
  );

  it("řadí tlačítka podle order a filtruje umístění", () => {
    expect(commandsFor("Quote", "form", customizations).map((c) => c.key)).toEqual(["a", "b"]);
    expect(commandsFor("Quote", "list", customizations).map((c) => c.key)).toEqual(["c"]);
  });

  it("vybere pluginy podle události v pořadí", () => {
    expect(pluginsFor("Quote", "beforeCreate", customizations).map((p) => p.key)).toEqual(["p1", "p2"]);
    expect(pluginsFor("Quote", "afterCreate", customizations).map((p) => p.key)).toEqual(["p1"]);
  });

  it("skripty entity i sdílené", () => {
    expect(scriptsFor("Quote", customizations)).toEqual({ shared: "s", own: "o" });
  });
});
