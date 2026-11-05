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

let sha, body, touched;
try {
  sha = sh("git rev-parse --short=7 HEAD");
  body = sh("git log -1 --format=%B");
  touched = sh("git show --name-only --format= HEAD");
} catch {
  process.exit(0); // not a git repo or no commits
}

const agentCommit = /Co-Authored-By:\s*Claude/i.test(body);
if (!agentCommit) process.exit(0);
if (touched.split("\n").some((f) => f.startsWith("docs/ai-log/"))) process.exit(0);

const dir = path.join(process.cwd(), "docs", "ai-log");
const logged = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => {
  if (!f.endsWith(".md")) return false;
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  return text.includes(sha);
});
if (logged) process.exit(0);

process.stderr.write(
  `The latest agent commit ${sha} is not recorded in docs/ai-log/. ` +
    `Use the log-ai-task skill to write an entry (requirement, prompt, what the AI did, validation, human corrections), ` +
    `then commit it.\n`,
);
process.exit(2);
