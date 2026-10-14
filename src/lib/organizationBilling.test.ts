import { describe, expect, it } from "vitest";
import type { EntityDefinition } from "@/engine/types";
import { lockVatRateUnlessPayer, toBillingSettings } from "./organizationBilling";

describe("toBillingSettings", () => {
  it("gives a non-payer a zero rate, so 21 % never gets prefilled 'just in case'", () => {
    expect(toBillingSettings(false, 21)).toEqual({ jePlatceDph: false, defaultVatRate: 0 });
  });

  it("treats a missing flag as a non-payer", () => {
    expect(toBillingSettings(null, 21)).toEqual({ jePlatceDph: false, defaultVatRate: 0 });
    expect(toBillingSettings(undefined, undefined)).toEqual({ jePlatceDph: false, defaultVatRate: 0 });
  });

  it("carries the payer's own rate, numeric even when PostgREST sends it as a string", () => {
    expect(toBillingSettings(true, "15.00")).toEqual({ jePlatceDph: true, defaultVatRate: 15 });
    expect(toBillingSettings(true, 21)).toEqual({ jePlatceDph: true, defaultVatRate: 21 });
  });

  it("falls back to 21 for a payer with no rate stored", () => {
    expect(toBillingSettings(true, null)).toEqual({ jePlatceDph: true, defaultVatRate: 21 });
  });
});

describe("lockVatRateUnlessPayer", () => {
  const entity: EntityDefinition = {
    name: "Quote",
    table: "quotes",
    displayName: "Nabídka",
    displayNamePlural: "Nabídky",
    primaryField: "name",
    statusReasonOptionSetKey: "quote_status_reason",
    fields: [
      { name: "name", label: "Název", type: "text" },
      { name: "vat_rate", label: "Sazba DPH (%)", type: "number" },
    ],
  };

  it("locks only the VAT rate for a non-payer, without touching the shared definition", () => {
    const locked = lockVatRateUnlessPayer(entity, false);
    expect(locked.fields.find((f) => f.name === "vat_rate")?.readOnly).toBe(true);
    expect(locked.fields.find((f) => f.name === "name")?.readOnly).toBeUndefined();
    expect(entity.fields[1]).not.toHaveProperty("readOnly");
  });

  it("leaves a payer's form editable", () => {
    expect(lockVatRateUnlessPayer(entity, true)).toBe(entity);
  });
});
