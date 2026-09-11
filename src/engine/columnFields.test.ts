import { describe, expect, it } from "vitest";
import { resolveFilterField } from "./columnFields";
import type { EntityDefinition } from "./types";

const entity: EntityDefinition = {
  name: "Project",
  table: "projects",
  displayName: "Projekt",
  displayNamePlural: "Projekty",
  primaryField: "name",
  statusReasonOptionSetKey: "project_status_reason",
  fields: [
    { name: "name", label: "Název", type: "text", required: true },
    { name: "account_id", label: "Klient", type: "lookup", targetEntity: "Account", required: true },
    { name: "deadline", label: "Deadline", type: "date" },
  ],
};

describe("resolveFilterField", () => {
  it("resolves a column that matches an entity field directly", () => {
    const resolved = resolveFilterField(entity, "name");
    expect(resolved).toEqual({ dbColumn: "name", field: entity.fields[0] });
  });

  it("resolves a computed alias column back to its underlying <field>_id lookup (account -> account_id)", () => {
    const resolved = resolveFilterField(entity, "account");
    expect(resolved?.dbColumn).toBe("account_id");
    expect(resolved?.field.type).toBe("lookup");
  });

  it("special-cases 'status_reason' to the universal status_reason_id optionset field", () => {
    const resolved = resolveFilterField(entity, "status_reason");
    expect(resolved).toEqual({
      dbColumn: "status_reason_id",
      field: {
        name: "status_reason_id",
        label: "Důvod stavu",
        type: "optionset",
        optionSetKey: "project_status_reason",
      },
    });
  });

  it("special-cases 'owner' to the universal owner_id lookup on User", () => {
    const resolved = resolveFilterField(entity, "owner");
    expect(resolved).toEqual({
      dbColumn: "owner_id",
      field: { name: "owner_id", label: "Vlastník", type: "lookup", targetEntity: "User" },
    });
  });

  it("returns null for a column with no backing field at all (e.g. Activity's entity_type discriminator)", () => {
    expect(resolveFilterField(entity, "entity_type")).toBeNull();
    expect(resolveFilterField(entity, "regarding")).toBeNull();
  });
});
