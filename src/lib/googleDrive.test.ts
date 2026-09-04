import { describe, expect, it } from "vitest";
import { extractDriveFolderId } from "./googleDrive";

describe("extractDriveFolderId", () => {
  it("extracts the id from a standard folder URL", () => {
    expect(extractDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
  });

  it("extracts the id from a folder URL with a trailing query string", () => {
    expect(extractDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
  });

  it("extracts the id from a folder URL scoped to a specific account (/u/0/)", () => {
    expect(extractDriveFolderId("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
  });

  it("extracts the id from an open?id= style link", () => {
    expect(extractDriveFolderId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")).toBe("1AbCdEfGhIjKlMnOp");
  });

  it("returns null for a URL that isn't a recognizable Drive folder link", () => {
    expect(extractDriveFolderId("https://example.com/some/path")).toBeNull();
  });

  it("returns null for empty/missing input", () => {
    expect(extractDriveFolderId(null)).toBeNull();
    expect(extractDriveFolderId(undefined)).toBeNull();
    expect(extractDriveFolderId("")).toBeNull();
  });
});
