import { PATH_RULES, SQL_RULES } from "./rules.mjs";

export const LEVELS = ["green", "orange", "red"];

const rank = (level) => LEVELS.indexOf(level);
export const worst = (levels) => levels.reduce((a, b) => (rank(b) > rank(a) ? b : a), "green");

/**
 * Zařadí jednu změněný soubor do semaforu.
 * @param {{ path: string, status?: "A"|"M"|"D"|"R", addedText?: string }} change
 *   path relativně ke kořeni repa (s lomítky), addedText = přidané řádky (stačí u migrací)
 * @returns {{ path: string, level: string, reasons: { level: string, reason: string }[] }}
 */
export function classifyChange({ path, status = "M", addedText = "" }) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const reasons = [];

  // Na jeden soubor stačí nejhorší pravidlo podle cesty — oranžové "migrace" se nepřidá,
  // když už sedí červené "úprava aplikované migrace".
  const pathHit = PATH_RULES.filter((r) => r.test.test(normalized) && (!r.statuses || r.statuses.includes(status)))
    .sort((a, b) => rank(b.level) - rank(a.level))[0];
  if (pathHit) reasons.push({ level: pathHit.level, reason: pathHit.reason });

  if (/^supabase\/migrations\/.*\.sql$/.test(normalized) && addedText) {
    const sql = stripSqlComments(addedText);
    for (const rule of SQL_RULES) {
      if (rule.test.test(sql)) reasons.push({ level: rule.level, reason: rule.reason });
    }
  }

  return { path: normalized, level: worst(reasons.map((r) => r.level)), reasons };
}

/** Zařadí celou sadu změn (PR). Výsledná úroveň = nejhorší soubor. */
export function classifyChangeSet(changes) {
  const files = changes.map(classifyChange);
  return { level: worst(files.map((f) => f.level)), files };
}

// Komentáře v migracích jsou česky a běžně obsahují slova jako "drop" nebo "delete" —
// do klasifikace patří jen samotné SQL.
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export const LEVEL_LABEL = { green: "🟢 zelená", orange: "🟠 oranžová", red: "🔴 červená" };

/** Česky čitelné shrnutí pro komentář v PR / hlášku hooku. */
export function describe(result) {
  const lines = [`**Semafor: ${LEVEL_LABEL[result.level]}**`, ""];
  const flagged = result.files.filter((f) => f.level !== "green");
  if (flagged.length === 0) {
    lines.push("Běžná změna — nic citlivého.");
  } else {
    for (const f of flagged) {
      lines.push(`- ${LEVEL_LABEL[f.level]} \`${f.path}\` — ${f.reasons.map((r) => r.reason).join("; ")}`);
    }
  }
  return lines.join("\n");
}
