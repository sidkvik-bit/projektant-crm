/** Čisté (testovatelné) funkce pro sestavení obsahu Aktivity z Gmail zprávy — dekódování těla,
 * odstranění HTML značek a poskládání čitelného popisu (Od/Komu/Kopie/Priorita + text). */

const MAX_BODY_LENGTH = 3000;

export interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

/** Projde MIME strom a najde text — text/plain se preferuje, text/html je záložní varianta. */
export function extractBodyText(payload: GmailPart | undefined): { text: string; isHtml: boolean } | null {
  if (!payload) return null;

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return { text: decodeBase64Url(payload.body.data), isHtml: false };
  }

  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      const found = extractBodyText(part);
      if (found && !found.isHtml) return found;
    }
    for (const part of payload.parts) {
      const found = extractBodyText(part);
      if (found) return found;
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return { text: decodeBase64Url(payload.body.data), isHtml: true };
  }

  return null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ořízne dlouhá těla (citované vlákno, newslettery…) na rozumnou délku pro Popis aktivity. */
export function truncateBody(text: string, maxLength: number = MAX_BODY_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
}

/** `Importance: high/low` (RFC 2156, běžné) nebo `X-Priority: 1–5` (starší, Outlook) — `null`
 * pro normální/nespecifikovanou prioritu, ať se každá Aktivita nezahltí "Priorita: Normální". */
export function resolvePriorityLabel(importance: string | null, xPriority: string | null): string | null {
  const normalizedImportance = importance?.trim().toLowerCase();
  if (normalizedImportance === "high") return "Vysoká";
  if (normalizedImportance === "low") return "Nízká";

  const priorityNumber = xPriority ? parseInt(xPriority, 10) : NaN;
  if (!Number.isNaN(priorityNumber)) {
    if (priorityNumber <= 2) return "Vysoká";
    if (priorityNumber >= 4) return "Nízká";
  }

  return null;
}

export function buildActivityDescription(params: {
  from: string | null;
  to: string | null;
  cc: string | null;
  priority: string | null;
  body: string | null;
  snippet: string | null;
}): string {
  const lines: string[] = [];
  if (params.from) lines.push(`Od: ${params.from}`);
  if (params.to) lines.push(`Komu: ${params.to}`);
  if (params.cc) lines.push(`Kopie: ${params.cc}`);
  if (params.priority) lines.push(`Priorita: ${params.priority}`);

  const content = params.body ?? params.snippet ?? "";
  if (lines.length > 0 && content) lines.push("");
  if (content) lines.push(truncateBody(content));

  return lines.join("\n");
}
