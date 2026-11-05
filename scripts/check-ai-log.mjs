#!/usr/bin/env node
// Claude Code Stop hook: block ending a session while the latest agent-authored
// commit is not referenced in docs/ai-log/. Exit 2 = block, stderr goes to the agent.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
  /* no stdin when run manually */
}
// Never loop: if we already blocked once this stop, let it through.
if (input.stop_hook_active) process.exit(0);

// Every agent-authored commit on this branch (since it left origin/main) must be referenced by an
// AI-log entry, or be a commit that itself adds/edits an entry. Checking only HEAD let earlier
// commits in a multi-commit task slip through.
let shas;
try {
  const base = (() => { try { return sh("git merge-base HEAD origin/main"); } catch { return ""; } })();
  const range = base ? `${base}..HEAD` : "-n 20 HEAD";
  shas = sh(`git log --format=%h%x09%B%x1e ${range}`)
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => /Co-Authored-By:\s*Claude/i.test(r))
    .map((r) => r.split("\t")[0].slice(0, 7));
} catch {
  process.exit(0); // not a git repo or no commits
}

const dir = path.join(process.cwd(), "docs", "ai-log");
const logText = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
  : "";
const touchesLog = (sha) => {
  try { return sh(`git show --name-only --format= ${sha}`).split("\n").some((f) => f.startsWith("docs/ai-log/")); } catch { return false; }
};
const missing = shas.filter((sha) => !logText.includes(sha) && !touchesLog(sha));
if (!missing.length) process.exit(0);

process.stderr.write(
  `Agent commit(s) not recorded in docs/ai-log/: ${missing.join(", ")}. ` +
    `Use the log-ai-task skill to write or update an entry (requirement, prompt, what the AI did, validation, human corrections) ` +
    `listing these commits, then commit it.\n`,
);
process.exit(2);
