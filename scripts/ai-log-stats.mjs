#!/usr/bin/env node
// Aggregate docs/ai-log/*.md frontmatter into a Markdown summary for reports.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "docs", "ai-log");
const entries = fs
  .readdirSync(dir)
  .filter((f) => /^\d{3}-.*\.md$/.test(f))
  .sort()
  .map((f) => {
    // normalise CRLF: Windows checkouts (core.autocrlf) otherwise break the frontmatter match
    const m = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/);
    const meta = {};
    for (const line of (m?.[1] ?? "").split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/);
      if (!kv) continue;
      let v = kv[2];
      if (v.startsWith("[")) v = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      else if (/^\d+$/.test(v)) v = Number(v);
      meta[kv[1]] = v;
    }
    return { file: f, ...meta };
  });

const count = (key) => {
  const out = {};
  for (const e of entries) for (const v of [].concat(e[key] ?? [])) out[v] = (out[v] ?? 0) + 1;
  return out;
};
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "—";
const corrections = entries.reduce((n, e) => n + (Number(e.human_corrections) || 0), 0);

console.log(`## AI task log summary (${entries.length} tasks)\n`);
console.log(`| Metric | Value |\n|---|---|`);
console.log(`| Tasks by type | ${fmt(count("type"))} |`);
console.log(`| Outcomes | ${fmt(count("outcome"))} |`);
console.log(`| Human corrections | ${corrections} across ${entries.filter((e) => e.human_corrections > 0).length} tasks |`);
console.log(`| How defects were caught | ${fmt(count("caught_by"))} |`);
console.log(`| Agents / models | ${fmt(count("agent"))} / ${fmt(count("model"))} |`);
console.log(`\n| # | Date | Type | Outcome | Corrections | Entry |\n|---|---|---|---|---|---|`);
for (const e of entries) console.log(`| ${e.id} | ${e.date} | ${e.type} | ${e.outcome} | ${e.human_corrections} | ${e.file} |`);
