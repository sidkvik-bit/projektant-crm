import { describe, expect, it } from "vitest";
import { defaultAnnotations } from "./annotations";

describe("defaultAnnotations", () => {
  it("marks reads and prepare-only tools as read-only", () => {
    for (const name of ["list_records", "get_record", "describe_entity", "search_crm", "preview_customization_changes", "request_delete"]) {
      expect(defaultAnnotations(name)).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
  });

  it("marks additive writes as non-destructive", () => {
    expect(defaultAnnotations("create_record")).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(defaultAnnotations("add_quote_item")).toMatchObject({ destructiveHint: false });
  });

  it("marks overwrites as destructive, idempotent where repeating is harmless", () => {
    expect(defaultAnnotations("update_record")).toMatchObject({ destructiveHint: true, idempotentHint: true });
    expect(defaultAnnotations("publish_customizations")).toMatchObject({ destructiveHint: true });
    expect(defaultAnnotations("publish_customizations").idempotentHint).toBeUndefined();
  });
});
