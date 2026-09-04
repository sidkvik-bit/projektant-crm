export type StatusTone = "info" | "warning" | "success" | "neutral" | "danger";

const PALETTE: StatusTone[] = ["info", "warning", "success", "danger", "neutral"];

/**
 * Deterministically maps a status/status_reason label to a color tone — same label always
 * gets the same color everywhere in the app. Purely presentational: option_set_values has
 * no color column data today, so this derives a tone from the label text itself instead of
 * requiring one to be set up front.
 */
export function resolveStatusTone(label: string | null | undefined): StatusTone {
  if (!label) return "neutral";
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export const STATUS_TONE_DOT_CLASS: Record<StatusTone, string> = {
  info: "bg-status-info",
  warning: "bg-status-warning",
  success: "bg-status-success",
  neutral: "bg-status-neutral",
  danger: "bg-status-danger",
};

export const STATUS_TONE_TEXT_CLASS: Record<StatusTone, string> = {
  info: "text-status-info",
  warning: "text-status-warning",
  success: "text-status-success",
  neutral: "text-status-neutral",
  danger: "text-status-danger",
};

export interface StatusBreakdownEntry {
  label: string;
  count: number;
  tone: StatusTone;
}

/**
 * Groups rows by their "status_reason" label into counts + tones, ordered by count
 * descending — feeds both GridEngine's footer legend and the list page header's segmented
 * bar (see PageHeader `stats`). Rows without a status_reason are bucketed as "Bez stavu".
 */
export function computeStatusBreakdown(rows: { status_reason?: unknown }[]): StatusBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = (row.status_reason as string | null | undefined) ?? "Bez stavu";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, tone: label === "Bez stavu" ? ("neutral" as const) : resolveStatusTone(label) }))
    .sort((a, b) => b.count - a.count);
}
