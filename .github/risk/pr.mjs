// Spouští risk-gate.yml: zařadí PR do semaforu, nastaví štítek, napíše komentář
// a u červené změny bez Honzova schválení selže (check "risk-gate" je povinný pro develop).
import { execFileSync } from "node:child_process";
import { classifyChangeSet, describe } from "./classify.mjs";
import { changedFiles } from "./diff.mjs";
import { gateDecision, REPO_OWNER } from "./gate.mjs";

const { BASE_SHA, HEAD_SHA, PR_NUMBER, PR_AUTHOR, GITHUB_REPOSITORY } = process.env;
const LABELS = { green: "riziko: zelená", orange: "riziko: oranžová", red: "riziko: červená" };
const LABEL_COLORS = { green: "2da44e", orange: "d4a72c", red: "cf222e" };
const COMMENT_MARKER = "<!-- risk-gate -->";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
const ghJson = (...args) => JSON.parse(gh(...args));
// --paginate vrací stránky jako samostatná pole; --slurp je obalí do jednoho.
const ghList = (path) => ghJson("api", path, "--paginate", "--slurp").flat();

function setLabel(level) {
  for (const [key, name] of Object.entries(LABELS)) {
    gh("label", "create", name, "--color", LABEL_COLORS[key], "--force", "-R", GITHUB_REPOSITORY);
  }
  const current = ghJson("pr", "view", PR_NUMBER, "-R", GITHUB_REPOSITORY, "--json", "labels").labels.map((l) => l.name);
  const stale = current.filter((l) => Object.values(LABELS).includes(l) && l !== LABELS[level]);
  const args = ["pr", "edit", PR_NUMBER, "-R", GITHUB_REPOSITORY, "--add-label", LABELS[level]];
  if (stale.length) args.push("--remove-label", stale.join(","));
  gh(...args);
}

function upsertComment(body) {
  const comments = ghList(`repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`);
  const existing = comments.find((c) => c.body?.startsWith(COMMENT_MARKER));
  const text = `${COMMENT_MARKER}\n${body}`;
  if (existing) {
    gh("api", "-X", "PATCH", `repos/${GITHUB_REPOSITORY}/issues/comments/${existing.id}`, "-f", `body=${text}`);
  } else {
    gh("api", `repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`, "-f", `body=${text}`);
  }
}

const result = classifyChangeSet(changedFiles(BASE_SHA, HEAD_SHA));
const reviews = ghList(`repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/reviews`);
const decision = gateDecision({ level: result.level, author: PR_AUTHOR, headSha: HEAD_SHA, reviews });

setLabel(result.level);
upsertComment(`${describe(result)}\n\n${decision.pass ? "✅" : "⏳"} ${decision.why}`);
if (!decision.pass && result.level === "red") {
  // Žádost o review = e-mail Honzovi. Opakovaná žádost nevadí.
  gh("pr", "edit", PR_NUMBER, "-R", GITHUB_REPOSITORY, "--add-reviewer", REPO_OWNER);
}

console.log(describe(result));
console.log(decision.why);
if (!decision.pass) process.exit(1);
