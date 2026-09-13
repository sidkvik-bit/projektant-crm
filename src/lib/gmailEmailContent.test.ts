import { describe, expect, it } from "vitest";
import {
  buildActivityDescription,
  decodeBase64Url,
  extractBodyText,
  resolvePriorityLabel,
  stripHtml,
  truncateBody,
} from "./gmailEmailContent";

function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

describe("decodeBase64Url", () => {
  it("round-trips text through Gmail's url-safe base64 encoding", () => {
    expect(decodeBase64Url(encodeBase64Url("Ahoj, jak se máš?"))).toBe("Ahoj, jak se máš?");
  });
});

describe("extractBodyText", () => {
  it("returns null for a missing payload", () => {
    expect(extractBodyText(undefined)).toBeNull();
  });

  it("extracts a simple text/plain payload", () => {
    const result = extractBodyText({ mimeType: "text/plain", body: { data: encodeBase64Url("Ahoj") } });
    expect(result).toEqual({ text: "Ahoj", isHtml: false });
  });

  it("prefers text/plain over text/html in a multipart message", () => {
    const result = extractBodyText({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: encodeBase64Url("<p>Html</p>") } },
        { mimeType: "text/plain", body: { data: encodeBase64Url("Plain text") } },
      ],
    });
    expect(result).toEqual({ text: "Plain text", isHtml: false });
  });

  it("falls back to text/html when no text/plain part exists", () => {
    const result = extractBodyText({
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/html", body: { data: encodeBase64Url("<p>Html only</p>") } }],
    });
    expect(result).toEqual({ text: "<p>Html only</p>", isHtml: true });
  });

  it("recurses into nested multipart structures", () => {
    const result = extractBodyText({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: encodeBase64Url("Nested plain") } }],
        },
      ],
    });
    expect(result).toEqual({ text: "Nested plain", isHtml: false });
  });
});

describe("stripHtml", () => {
  it("converts tags to plain text with sensible line breaks", () => {
    expect(stripHtml("<p>Ahoj</p><p>Jak se máš?</p>")).toBe("Ahoj\n\nJak se máš?");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });

  it("strips style/script blocks entirely", () => {
    expect(stripHtml("<style>.x{color:red}</style><p>Text</p><script>evil()</script>")).toBe("Text");
  });
});

describe("truncateBody", () => {
  it("leaves short text untouched", () => {
    expect(truncateBody("krátký text", 100)).toBe("krátký text");
  });

  it("truncates long text with an ellipsis", () => {
    const long = "a".repeat(200);
    const result = truncateBody(long, 50);
    expect(result.length).toBe(51); // 50 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("resolvePriorityLabel", () => {
  it("maps Importance: high/low to Czech labels", () => {
    expect(resolvePriorityLabel("high", null)).toBe("Vysoká");
    expect(resolvePriorityLabel("low", null)).toBe("Nízká");
  });

  it("is case-insensitive on Importance", () => {
    expect(resolvePriorityLabel("High", null)).toBe("Vysoká");
  });

  it("falls back to X-Priority (1-2 high, 4-5 low)", () => {
    expect(resolvePriorityLabel(null, "1")).toBe("Vysoká");
    expect(resolvePriorityLabel(null, "2")).toBe("Vysoká");
    expect(resolvePriorityLabel(null, "4")).toBe("Nízká");
    expect(resolvePriorityLabel(null, "5")).toBe("Nízká");
  });

  it("returns null for normal/unspecified priority — avoids cluttering every activity", () => {
    expect(resolvePriorityLabel(null, null)).toBeNull();
    expect(resolvePriorityLabel("normal", null)).toBeNull();
    expect(resolvePriorityLabel(null, "3")).toBeNull();
  });
});

describe("buildActivityDescription", () => {
  it("builds a full header block plus body", () => {
    const result = buildActivityDescription({
      from: "Jan Novák <jan@example.cz>",
      to: "klient@firma.cz",
      cc: "kolega@navertica.com",
      priority: "Vysoká",
      body: "Dobrý den, posílám nabídku.",
      snippet: "fallback snippet",
    });
    expect(result).toBe(
      "Od: Jan Novák <jan@example.cz>\nKomu: klient@firma.cz\nKopie: kolega@navertica.com\nPriorita: Vysoká\n\nDobrý den, posílám nabídku.",
    );
  });

  it("omits absent header lines (no Cc, no priority)", () => {
    const result = buildActivityDescription({
      from: "jan@example.cz",
      to: "klient@firma.cz",
      cc: null,
      priority: null,
      body: "Text",
      snippet: null,
    });
    expect(result).toBe("Od: jan@example.cz\nKomu: klient@firma.cz\n\nText");
  });

  it("falls back to the Gmail snippet when the full body couldn't be extracted", () => {
    const result = buildActivityDescription({
      from: "jan@example.cz",
      to: null,
      cc: null,
      priority: null,
      body: null,
      snippet: "krátký náhled",
    });
    expect(result).toBe("Od: jan@example.cz\n\nkrátký náhled");
  });

  it("still returns just the body when there are no headers at all", () => {
    const result = buildActivityDescription({ from: null, to: null, cc: null, priority: null, body: "jen text", snippet: null });
    expect(result).toBe("jen text");
  });
});
