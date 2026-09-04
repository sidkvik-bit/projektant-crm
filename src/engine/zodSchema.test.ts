import { describe, expect, it } from "vitest";
import { fieldToZod, buildEntityZodSchema } from "./zodSchema";
import type { EntityDefinition, FieldDefinition } from "./types";

describe("fieldToZod — required fields", () => {
  it("rejects an untouched (undefined) required text field with the friendly message, not a raw type error", () => {
    const field: FieldDefinition = { name: "name", label: "Název", type: "text", required: true };
    const result = fieldToZod(field).safeParse(undefined);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Název je povinné pole");
  });

  it("rejects an empty string the same way as undefined", () => {
    const field: FieldDefinition = { name: "name", label: "Název", type: "text", required: true };
    const result = fieldToZod(field).safeParse("");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Název je povinné pole");
  });

  it("accepts a real value", () => {
    const field: FieldDefinition = { name: "name", label: "Název", type: "text", required: true };
    expect(fieldToZod(field).parse("Novák Architekti")).toBe("Novák Architekti");
  });

  it("accepts a required boolean explicitly set to false (false is a value, not 'missing')", () => {
    const field: FieldDefinition = { name: "confirmed", label: "Potvrzeno", type: "boolean", required: true };
    expect(fieldToZod(field).parse(false)).toBe(false);
  });

  it("uses a caller-supplied message when given (ImportWizard's generic 'Povinné pole')", () => {
    const field: FieldDefinition = { name: "name", label: "Název", type: "text", required: true };
    const result = fieldToZod(field, "Povinné pole").safeParse(undefined);
    expect(result.error?.issues[0]?.message).toBe("Povinné pole");
  });

  it("still enforces the underlying type once the blank check passes (e.g. a malformed email)", () => {
    const field: FieldDefinition = { name: "email", label: "E-mail", type: "email", required: true };
    const result = fieldToZod(field).safeParse("not-an-email");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Neplatný e-mail");
  });
});

describe("fieldToZod — optional fields", () => {
  it("treats an empty string the same as no value (regression: clearing a lookup combobox emits '', not null)", () => {
    const field: FieldDefinition = { name: "account_id", label: "Klient", type: "lookup", targetEntity: "Account" };
    const result = fieldToZod(field).safeParse("");
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it("still validates a real value against the underlying type (a non-UUID lookup value is rejected)", () => {
    const field: FieldDefinition = { name: "account_id", label: "Klient", type: "lookup", targetEntity: "Account" };
    const result = fieldToZod(field).safeParse("not-a-uuid");
    expect(result.success).toBe(false);
  });

  it("accepts a real UUID value", () => {
    const field: FieldDefinition = { name: "account_id", label: "Klient", type: "lookup", targetEntity: "Account" };
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(fieldToZod(field).parse(uuid)).toBe(uuid);
  });

  it("accepts undefined and null for an optional text field", () => {
    const field: FieldDefinition = { name: "description", label: "Popis", type: "textarea" };
    expect(fieldToZod(field).safeParse(undefined).success).toBe(true);
    expect(fieldToZod(field).safeParse(null).success).toBe(true);
  });
});

describe("buildEntityZodSchema", () => {
  const entity: EntityDefinition = {
    name: "Bug",
    table: "bugs",
    displayName: "Bug",
    displayNamePlural: "Bugy",
    primaryField: "name",
    statusReasonOptionSetKey: "bug_status_reason",
    fields: [
      { name: "name", label: "Název", type: "text", required: true },
      { name: "description", label: "Popis problému", type: "textarea", required: true },
      { name: "image_url", label: "Screenshot", type: "image" },
    ],
  };

  it("blocks submission when a required field is missing, reporting that specific field", () => {
    const result = buildEntityZodSchema(entity).safeParse({ name: "Uložit nejde", status: "active" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages).toContain("Popis problému je povinné pole");
  });

  it("passes when all required fields are present and the optional image is left empty", () => {
    const result = buildEntityZodSchema(entity).safeParse({
      name: "Tlačítko nereaguje",
      description: "Klik na Uložit nedělá nic v Safari.",
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("always allows status_reason_id and owner_id to be absent — they're optional system fields", () => {
    const result = buildEntityZodSchema(entity).safeParse({
      name: "X",
      description: "Y",
      status: "active",
    });
    expect(result.success).toBe(true);
  });
});
