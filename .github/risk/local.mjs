// Semafor pro aktuální větev proti origin/develop — totéž, co pak spočítá risk-gate v PR.
//   node .github/risk/local.mjs [base]
import { classifyChangeSet, describe } from "./classify.mjs";
import { changedFiles } from "./diff.mjs";

const base = process.argv[2] ?? "origin/develop";
const result = classifyChangeSet(changedFiles(base, "HEAD"));
console.log(describe(result));
