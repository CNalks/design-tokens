// Gate tests. Every experiment runs on a throw-away copy of the package in os.tmpdir(); the real repo files are never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const FILES = ["tokens.css", "motion.css", "reveal.ts", "globe-colors.ts", "tokens.json", "package.json", "scripts"];
const log = (title, r) => console.log(`\n----- ${title} (exit ${r.status}) -----\n${(r.stdout + r.stderr).trim()}`);

function sandbox(withGit = false) {
  const d = mkdtempSync(join(tmpdir(), "dt-gate-"));
  for (const f of FILES) cpSync(join(repo, f), join(d, f), { recursive: true });
  if (withGit) {
    const g = (...a) => execFileSync("git", ["-C", d, ...a], { stdio: "pipe" });
    g("init", "-q"); g("add", "-A");
    g("-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "baseline"); g("tag", "baseline");
  }
  const run = (script, ...args) => spawnSync(process.execPath, [join(d, "scripts", script), ...args], { encoding: "utf8" });
  const edit = (file, fn) => writeFileSync(join(d, file), fn(readFileSync(join(d, file), "utf8")));
  return { d, run, edit, done: () => rmSync(d, { recursive: true, force: true }) };
}

test("baseline: real repo passes check and review reports zero diff against v0.1.0-equivalent HEAD copy", () => {
  const s = sandbox(true);
  try {
    const c = s.run("check.mjs"); log("baseline check", c);
    assert.equal(c.status, 0); assert.match(c.stdout, /ok: 111 contrast pairs/);
    const r = s.run("review.mjs", "--base", "baseline"); log("baseline review", r);
    assert.equal(r.status, 0); assert.match(r.stdout, /与基线零差异/);
  } finally { s.done(); }
});

test("① night-only new disease hue fails; adding day + [data-accent] + ACCENT mirror passes", () => {
  const s = sandbox();
  try {
    // add --d-mpox to the night block only
    s.edit("tokens.css", (t) => t.replace("--d-malaria: #64d7aa; }", "--d-malaria: #64d7aa; --d-mpox: #e0a8ff; }"));
    let b = s.run("check.mjs", "--write"), c = s.run("check.mjs"); log("① night only: check", c);
    assert.equal(c.status, 1);
    assert.match(c.stdout, /FAIL disease mpox: --d-mpox has no day value/);
    assert.match(c.stdout, /FAIL globe-colors.ts missing ACCENT\.mpox/);
    assert.match(c.stdout, /FAIL disease mpox: no \[data-accent="mpox"\]/);
    // complete it: day value, selector, mirror
    s.edit("tokens.css", (t) => t
      .replace("--d-malaria: #006f44; }", "--d-malaria: #006f44; --d-mpox: #7a3a8f; }")
      .replace('[data-accent="malaria"] { --data: var(--d-malaria); }', '[data-accent="malaria"] { --data: var(--d-malaria); }\n[data-accent="mpox"] { --data: var(--d-mpox); }'));
    s.edit("globe-colors.ts", (t) => t.replace('malaria: { night: "#64d7aa", day: "#006f44" },', 'malaria: { night: "#64d7aa", day: "#006f44" },\n  mpox: { night: "#e0a8ff", day: "#7a3a8f" },'));
    b = s.run("check.mjs", "--write"); c = s.run("check.mjs"); log("① completed: check", c);
    assert.equal(b.status, 0); assert.equal(c.status, 0);
    assert.match(c.stdout, /ok: 116 contrast pairs/); // 111 + 5 rules for the new hue
  } finally { s.done(); }
});

test("① day-only hue and a mirror that drifts both fail", () => {
  const s = sandbox();
  try {
    s.edit("tokens.css", (t) => t.replace("--d-malaria: #006f44; }", "--d-malaria: #006f44; --d-mpox: #7a3a8f; }"));
    s.run("check.mjs", "--write"); let c = s.run("check.mjs"); log("① day only: check", c);
    assert.equal(c.status, 1); assert.match(c.stdout, /FAIL disease mpox: --d-mpox has no night value/);
    const t = sandbox();
    try {
      t.edit("globe-colors.ts", (x) => x.replace('ebola: { night: "#ff6c5d"', 'ebola: { night: "#ff6c5e"'));
      c = t.run("check.mjs"); log("① ACCENT drift: check", c);
      assert.equal(c.status, 1); assert.match(c.stdout, /FAIL ACCENT\.ebola\.night != --d-ebola \(dark\)/);
    } finally { t.done(); }
  } finally { s.done(); }
});

test("② changing an existing value: review shows the scope and before -> after", () => {
  const s = sandbox(true);
  try {
    // dark-theme --event-ink (declared in the ':root[data-theme="dark"], .band-sea--night' block)
    s.edit("tokens.css", (t) => t.replace("--event-ink: #e9b073;", "--event-ink: #f0c08a;"));
    s.run("check.mjs", "--write");
    const r = s.run("review.mjs", "--base", "baseline"); log("② review", r);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /作用域 scope: dark, \.band-sea--night\n\s+~ --event-ink: #e9b073 -> #f0c08a/);
    assert.match(r.stdout, /\(\+0 -0 ~1\)/);
    assert.match(r.stdout, /✓ --event-ink — 对比度（contract\.json 对列表）/);
    assert.match(r.stdout, /~ tokens\.json/);
    assert.doesNotMatch(r.stdout, /零差异/);
  } finally { s.done(); }
});

test("③ a registered text colour moved to low contrast makes check fail", () => {
  const s = sandbox();
  try {
    s.edit("tokens.css", (t) => t.replace("--muted: #6e6e73;", "--muted: #b0b0b5;"));
    s.run("check.mjs", "--write"); // keep tokens.json in sync so only the contrast gate can fail
    const c = s.run("check.mjs"); log("③ check", c);
    assert.equal(c.status, 1);
    assert.match(c.stdout, /FAIL light: muted on bg = \d\.\d\d < 4\.5/);
    assert.doesNotMatch(c.stdout, /tokens\.json is out of date/);
  } finally { s.done(); }
});

test("extra: unregistered text-like token warns (fails with --strict); stale tokens.json fails", () => {
  const s = sandbox();
  try {
    s.edit("tokens.css", (t) => t.replace("--muted: #6e6e73;", "--muted: #6e6e73;\n  --note-ink: #c8c8c8;"));
    s.run("check.mjs", "--write");
    let c = s.run("check.mjs"); log("extra warn", c);
    assert.equal(c.status, 0); assert.match(c.stdout, /WARN --note-ink looks like a text colour/);
    c = s.run("check.mjs", "--strict"); log("extra --strict", c);
    assert.equal(c.status, 1);
    s.edit("tokens.css", (t) => t.replace("--note-ink: #c8c8c8;", "--note-ink: #c8c8c9;")); // no rebuild
    c = s.run("check.mjs"); log("extra stale json", c);
    assert.equal(c.status, 1); assert.match(c.stdout, /tokens\.json is out of date/);
  } finally { s.done(); }
});

test("the real repo files are untouched by the tests", () => {
  const st = execFileSync("git", ["-C", repo, "status", "--porcelain", "--", "tokens.css", "motion.css", "reveal.ts", "globe-colors.ts", "tokens.json"], { encoding: "utf8" });
  assert.equal(st, "");
});

test("B: docs/token-contract.md is up to date and regeneration is byte-identical", () => {
  const s = sandbox();
  try {
    cpSync(join(repo, "docs"), join(s.d, "docs"), { recursive: true });
    const c = s.run("contract-doc.mjs", "--check"); log("contract-doc --check", c);
    assert.equal(c.status, 0);
    const a = readFileSync(join(s.d, "docs/token-contract.md"), "utf8");
    s.run("contract-doc.mjs"); s.run("contract-doc.mjs");
    assert.equal(readFileSync(join(s.d, "docs/token-contract.md"), "utf8"), a);
  } finally { s.done(); }
});
