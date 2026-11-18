import { describe, expect, it } from "vitest";
import type { EntityDefinition } from "@/engine/types";
import type { OptionSetValue } from "@/engine/optionSets";
import { labelOptionValues, prepareValues } from "./entityValues";

const entity: EntityDefinition = {
  name: "Quote",
  table: "quotes",
  displayName: "Nabídka",
  displayNamePlural: "Nabídky",
  primaryField: "name",
  statusReasonOptionSetKey: "quote_status_reason",
  fields: [
    { name: "name", label: "Název", type: "text", required: true },
    { name: "cena", label: "Cena", type: "currency" },
    { name: "email", label: "E-mail", type: "email" },
    { name: "project_id", label: "Projekt", type: "lookup", targetEntity: "Project" },
    { name: "druh", label: "Druh", type: "optionset", optionSetKey: "druh" },
    { name: "cislo", label: "Číslo", type: "text", readOnly: true },
    { name: "new_zakazka", label: "Zakázka", type: "text" },
  ],
};

const value = (id: string, label: string): OptionSetValue => ({
  id,
  value_key: label.toLowerCase(),
  label,
  color: null,
  sort_order: 0,
  is_default: false,
  status_scope: null,
});
const RD = "11111111-1111-4111-8111-111111111111";
const SENT = "22222222-2222-4222-8222-222222222222";
const options = { druh: [value(RD, "Rodinný dům")], quote_status_reason: [value(SENT, "Odeslaná")] };

describe("prepareValues", () => {
  it("translates option labels to ids, coerces numbers, keeps custom fields", () => {
    const result = prepareValues(
      entity,
      { name: "Nabídka", cena: "1500", druh: "rodinny dum", status_reason_id: "Odeslaná", new_zakazka: "Z-1" },
      options,
      "create",
    );
    expect(result).toEqual({
      ok: true,
      values: { name: "Nabídka", cena: 1500, druh: RD, status_reason_id: SENT, new_zakazka: "Z-1" },
    });
  });

  it("rejects unknown, system and read-only fields", () => {
    const result = prepareValues(entity, { organization_id: RD, cislo: "1", name: "x" }, options, "update");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toMatch(/organization_id: entita Quote takové pole nemá/);
    expect(result.errors.join("\n")).toMatch(/cislo: pole jde jen číst/);
  });

  it("requires required fields on create only", () => {
    expect(prepareValues(entity, { cena: 1 }, options, "create")).toMatchObject({ ok: false });
    expect(prepareValues(entity, { cena: 1 }, options, "update")).toEqual({ ok: true, values: { cena: 1 } });
  });

  it("refuses clearing a required field and invalid formats", () => {
    const result = prepareValues(entity, { name: "", email: "nope" }, options, "update");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
  });

  it("asks for an id on lookups and lists valid options on a bad label", () => {
    const result = prepareValues(entity, { project_id: "Vila Novák", druh: "Hrad" }, options, "update");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/čeká se id záznamu/);
    expect(result.errors[1]).toMatch(/Možnosti: Rodinný dům/);
  });

  it("validates status and clears optional fields with null", () => {
    expect(prepareValues(entity, { status: "archived" }, options, "update")).toMatchObject({ ok: false });
    expect(prepareValues(entity, { status: "inactive", cena: null }, options, "update")).toEqual({
      ok: true,
      values: { status: "inactive", cena: null },
    });
  });

  it("rejects an update with nothing to change", () => {
    expect(prepareValues(entity, {}, options, "update")).toMatchObject({ ok: false });
  });
});

describe("labelOptionValues", () => {
  it("adds labels to option set ids", () => {
    expect(labelOptionValues(entity, { druh: RD, name: "x" }, options)).toEqual({ druh: { id: RD, label: "Rodinný dům" }, name: "x" });
  });
});
