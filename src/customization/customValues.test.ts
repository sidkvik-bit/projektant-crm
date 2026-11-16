import { describe, expect, it } from "vitest";
import { dbColumnRef, foldCustomValues, unfoldCustomValues } from "./customValues";
import { toCustomizationSet } from "./repository";
import { parsePackage } from "./package";
import { validateKey } from "./types";

describe("vlastní pole ↔ sloupec custom", () => {
  it("fold přesune new_* do custom a prázdný řetězec maže", () => {
    expect(foldCustomValues({ name: "X", new_a: 1, new_b: "" })).toEqual({ name: "X", custom: { new_a: 1, new_b: null } });
  });

  it("fold bez vlastních polí nepřidá prázdný custom (update jiných polí ho nepřepíše)", () => {
    expect(foldCustomValues({ name: "X" })).toEqual({ name: "X" });
  });

  it("unfold rozbalí custom zpět mezi pole záznamu", () => {
    expect(unfoldCustomValues({ id: "1", custom: { new_a: 2 } })).toEqual({ id: "1", new_a: 2 });
    const plain = { id: "1" };
    expect(unfoldCustomValues(plain)).toBe(plain);
  });

  it("filtr na vlastní pole jde přes jsonb", () => {
    expect(dbColumnRef("new_a")).toBe("custom->>new_a");
    expect(dbColumnRef("name")).toBe("name");
  });
});

describe("validateKey", () => {
  it("vynutí prefix new_ u polí a entit", () => {
    expect(validateKey("field", "Project", "new_cislo")).toBeNull();
    expect(validateKey("field", "Project", "cislo")).not.toBeNull();
    expect(validateKey("field", "Project", "new_Číslo")).not.toBeNull();
    expect(validateKey("entity", "new_Zakazka", "new_Zakazka")).toBeNull();
    expect(validateKey("entity", "new_Zakazka", "new_Jina")).not.toBeNull();
    expect(validateKey("form", "Project", "jiny")).not.toBeNull();
  });
});

describe("toCustomizationSet", () => {
  const row = (over: object) => ({
    id: "1",
    component_type: "field" as const,
    entity_name: "Project",
    key: "new_a",
    published: { label: "A", type: "text" },
    draft: { label: "A2", type: "text" },
    draft_deleted: false,
    published_at: null,
    updated_at: "",
    ...over,
  });

  it("bez náhledu bere publikovanou verzi, v náhledu draft", () => {
    expect(toCustomizationSet([row({})], false).of("field")[0].definition.label).toBe("A");
    expect(toCustomizationSet([row({})], true).of("field")[0].definition.label).toBe("A2");
  });

  it("nepublikovaná komponenta je vidět jen v náhledu, smazaná v draftu v náhledu zmizí", () => {
    expect(toCustomizationSet([row({ published: null })], false).isEmpty).toBe(true);
    expect(toCustomizationSet([row({ draft_deleted: true })], true).isEmpty).toBe(true);
  });

  it("neplatnou definici přeskočí místo pádu", () => {
    expect(toCustomizationSet([row({ published: { label: "A", type: "neznamy" } })], false).isEmpty).toBe(true);
  });
});

describe("parsePackage", () => {
  it("přijme platný balíček a odmítne cizí JSON", () => {
    const ok = parsePackage(JSON.stringify({ format: "projektant-crm-customization", version: 1, components: [] }));
    expect(ok.ok).toBe(true);
    expect(parsePackage("{}").ok).toBe(false);
    expect(parsePackage("nejson").ok).toBe(false);
  });
});
