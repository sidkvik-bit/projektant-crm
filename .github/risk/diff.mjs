import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Změněné soubory mezi base a head (jako v PR: od společného předka), ve tvaru pro classifyChangeSet.
 * U SQL přidá přidané řádky, protože migrace se posuzují i podle obsahu.
 */
export function changedFiles(base, head) {
  const range = `${base}...${head}`;
  return git("diff", "--name-status", "-M", range)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [rawStatus, ...paths] = line.split("\t");
      const status = rawStatus[0];
      const path = paths.at(-1);
      const addedText = path.endsWith(".sql") && status !== "D" ? addedLines(range, path) : "";
      return { path, status, addedText };
    });
}

function addedLines(range, path) {
  return git("diff", range, "--", path)
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
}
