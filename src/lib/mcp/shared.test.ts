import { describe, expect, it } from "vitest";
import { matchOptionValue, withStageLabel } from "./shared";
import type { OptionSetValue } from "@/engine/optionSets";

const stage = (id: string, value_key: string, label: string): OptionSetValue => ({
  id,
  value_key,
  label,
  color: null,
  sort_order: 1,
  is_default: false,
  status_scope: null,
});

const STAGES = [
  stage("s1", "poptavka", "Poptávka"),
  stage("s2", "smlouva_podepsana", "Smlouva podepsána"),
  stage("s3", "predani_kolaudace", "Předání/Kolaudace"),
];

describe("matchOptionValue", () => {
  it("najde fázi podle přesného názvu", () => {
    expect(matchOptionValue(STAGES, "Smlouva podepsána")).toEqual({ value: STAGES[1] });
  });

  // Tohle je ten podstatný případ: model diakritiku běžně vynechá nebo rozhodí velikost písmen.
  it.each(["smlouva podepsana", "SMLOUVA PODEPSÁNA", "  Smlouva Podepsana  "])("toleruje %j", (input) => {
    expect(matchOptionValue(STAGES, input)).toEqual({ value: STAGES[1] });
  });

  it("bere i technický klíč, ne jen popisek", () => {
    expect(matchOptionValue(STAGES, "predani_kolaudace")).toEqual({ value: STAGES[2] });
  });

  it("u nesmyslu vrátí seznam platných hodnot, ne prázdno", () => {
    expect(matchOptionValue(STAGES, "vyfakturovano")).toEqual({
      available: ["Poptávka", "Smlouva podepsána", "Předání/Kolaudace"],
    });
  });
});

describe("withStageLabel", () => {
  const labels = new Map([["s2", "Smlouva podepsána"]]);

  it("nahradí neužitečné UUID čitelnou fází", () => {
    expect(withStageLabel(labels)({ id: "p1", name: "Vila", status_reason_id: "s2" })).toEqual({
      id: "p1",
      name: "Vila",
      faze: "Smlouva podepsána",
    });
  });

  it("projekt bez fáze nevyhodí chybu ani nenechá viset UUID", () => {
    expect(withStageLabel(labels)({ id: "p2", status_reason_id: null })).toEqual({ id: "p2", faze: null });
  });
});
