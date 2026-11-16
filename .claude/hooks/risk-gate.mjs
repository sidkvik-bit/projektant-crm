// PreToolUse hook: před každou úpravou souboru ji zařadí do semaforu (.github/risk/rules.mjs).
//   red    → Claude Code se zeptá uživatele a Claude dostane pokyn vysvětlit dopad
//   orange → projde, Claude dostane pokyn upozornit uživatele na dopad
//   green  → nic
// Je to měkká vrstva pro Claudovo chování. Tvrdá pojistka je risk-gate.yml na GitHubu.
// Vlastník repa si ho vypne v .claude/settings.local.json: { "env": { "CRM_RISK_GATE": "off" } }
// (záložně i podle git identity — vlastník repa je sidkvik-bit).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyChange, LEVEL_LABEL } from "../../.github/risk/classify.mjs";

const REPO_OWNER = "sidkvik-bit";

if (process.env.CRM_RISK_GATE === "off" || gitUserName() === REPO_OWNER) process.exit(0);

function gitUserName() {
  try {
    return execFileSync("git", ["config", "user.name"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const input = JSON.parse(readFileSync(0, "utf8"));
const toolInput = input.tool_input ?? {};
const filePath = toolInput.file_path ?? toolInput.notebook_path;
if (!filePath) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const relative = path.relative(root, path.resolve(root, filePath)).replace(/\\/g, "/");
if (relative.startsWith("..")) process.exit(0); // mimo repo

const addedText = [toolInput.content, toolInput.new_string, ...(toolInput.edits ?? []).map((e) => e.new_string)]
  .filter(Boolean)
  .join("\n");
const status = existsSync(path.resolve(root, filePath)) ? "M" : "A";

const result = classifyChange({ path: relative, status, addedText });
if (result.level === "green") process.exit(0);

const why = result.reasons.map((r) => r.reason).join("; ");
const guidance =
  result.level === "red"
    ? `Tato změna je ${LEVEL_LABEL.red} (${why}). Než budeš pokračovat, vysvětli uživateli česky a srozumitelně, ` +
      "co změna udělá a co může rozbít, a že PR s ní počká na schválení od Honzy. Nabídni i variantu, " +
      "jak cíle dosáhnout bez červeného zásahu (např. přes vrstvu úprav firmy v appce). Viz CONTRIBUTING.md."
    : `Tato změna je ${LEVEL_LABEL.orange} (${why}). Pokud jsi to uživateli ještě neřekl, krátce mu česky vysvětli ` +
      "dopad a zeptej se, jestli o tom chce předem mluvit s Honzou. Schválení od Honzy ale není potřeba. Viz CONTRIBUTING.md.";

const hookSpecificOutput = { hookEventName: "PreToolUse", additionalContext: guidance };
if (result.level === "red") {
  hookSpecificOutput.permissionDecision = "ask";
  hookSpecificOutput.permissionDecisionReason = `${LEVEL_LABEL.red}: ${relative} — ${why}. PR počká na schválení od Honzy.`;
}
process.stdout.write(JSON.stringify({ hookSpecificOutput }));
