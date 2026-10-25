#!/usr/bin/env node
// Drift + contrast guard. Parses tokens.css (light / dark / sea / globe / disease), checks the WCAG pairs registered in
// scripts/contract.json, checks that every --d-<id> disease hue has day + night values, a [data-accent] rule and an
// ACCENT mirror in globe-colors.ts, that the globe FALLBACK matches the CSS, and that tokens.json is up to date.
// `--write` (npm run build) regenerates tokens.json from tokens.css. `--strict` turns warnings into failures.
import { readFileSync, writeFileSync } from "node:fs";
import { parseBlocks, modesOf, hex, color, ratio, pairsOf, loadContract, diseaseAudit, TEXTLIKE } from "./lib/tokens.mjs";
const dir = new URL("../", import.meta.url);
const blocks = parseBlocks(readFileSync(new URL("tokens.css", dir), "utf8"));
const modes = modesOf(blocks);
const { light, dark, dawn, night } = modes;

// [mode, fg, bg, min] from scripts/contract.json
const contract = loadContract(dir);
const P = pairsOf(contract);
const ts = readFileSync(new URL("globe-colors.ts", dir), "utf8");
const audit = diseaseAudit(blocks, ts);
const diseases = audit.ids.filter((id) => audit.rows.find((r) => r.id === id).day != null || audit.rows.find((r) => r.id === id).night != null);
let bad = 0, warned = 0; const seen = new Set(); const fail = (msg) => { if (seen.has(msg)) return; seen.add(msg); bad++; console.log("FAIL", msg); };
const warn = (msg) => { warned++; console.log("WARN", msg); };
for (const [m, fg, bg, min] of P) {
  const env = modes[m]; const b = color(env["--" + bg], env), f = color(env["--" + fg], env, b);
  if (!b || !f) { fail(`${m}: cannot resolve ${fg} / ${bg}`); continue; }
  const r = ratio(f, b); if (r < min) fail(`${m}: ${fg} on ${bg} = ${r.toFixed(2)} < ${min}`);
}
// disease hues: night hues on the night band, day hues on the dawn band + page
for (const id of diseases) {
  const n = hex(dark["--d-" + id]), d = hex(light["--d-" + id]);
  for (const [name, c, bgs, env, min] of [["night", n, ["--sea-0", "--sea-2"], night, 4.5], ["day", d, ["--sea-0", "--sea-2", "--bg"], dawn, 4.5], ["day", d, ["--panel"], light, 4.5]]) {
    if (!c) { fail(`disease ${id} ${name}: not a #rrggbb value`); continue; }
    for (const bg of bgs) { const r = ratio(c, color(env[bg], env)); if (r < min) fail(`disease ${id} ${name} on ${bg} = ${r.toFixed(2)}`); }
  }
}
// disease completeness + globe-colors.ts ACCENT mirror (both directions)
for (const p of audit.problems) fail(p);
// globe fallbacks mirror
const f255 = (a) => a.map((x) => Math.round(x * 255));
const fb = {};
for (const mode of ["night", "day"]) {
  const row = new RegExp(`${mode}: \\{([^}]*)\\}`).exec(ts.slice(ts.indexOf("const FALLBACK")))[1];
  for (const m of row.matchAll(/(\w+): \[([^\]]*)\]/g)) fb[`${mode}.${m[1]}`] = m[2].split(",").map(Number);
}
const KEY = { deep: "deep", ocean: "ocean", rim: "rim", halo: "halo", spec: "spec", dotLo: "dot-lo", dotHi: "dot-hi", sparkle: "sparkle", event: "event" };
const globe = { night: {}, day: {} };
for (const mode of ["night", "day"]) for (const [k, t] of Object.entries(KEY)) {
  const v = light[`--globe-${mode}-${t}`]; globe[mode][k] = v ?? null;
  if (!v) { if (!(mode === "day" && k === "sparkle")) fail(`missing --globe-${mode}-${t}`); continue; }
  const want = hex(v), got = f255(fb[`${mode}.${k}`] ?? [0, 0, 0]);
  if (want.some((x, i) => Math.abs(x - got[i]) > 1)) fail(`globe-colors.ts FALLBACK ${mode}.${k} ${got} != ${v}`);
}
// text-like tokens that no contrast pair covers (warning; --strict makes it a failure)
const fgs = new Set(P.map(([, fg]) => "--" + fg));
const allTokens = new Set(Object.values(modes).flatMap((e) => Object.keys(e)));
for (const k of [...allTokens].sort()) if (TEXTLIKE.test(k.slice(2)) && !fgs.has(k) && !k.startsWith("--d-")) warn(`${k} looks like a text colour but is not a foreground in scripts/contract.json (add a contrast pair)`);
// tokens.json
const json = { name: "@cnalks/design-tokens", version: JSON.parse(readFileSync(new URL("package.json", dir), "utf8")).version, themes: { light, dark }, sea: { dawn: Object.fromEntries(Object.entries(dawn).filter(([k]) => k.startsWith("--sea-"))), night: Object.fromEntries(Object.entries(night).filter(([k]) => k.startsWith("--sea-"))) }, disease: Object.fromEntries(diseases.map((id) => [id, { night: dark["--d-" + id], day: light["--d-" + id] }])), globe: Object.fromEntries(Object.entries(light).filter(([k]) => k.startsWith("--globe-"))) };
const jsonText = JSON.stringify(json, null, 2) + "\n";
if (process.argv.includes("--write")) { writeFileSync(new URL("tokens.json", dir), jsonText); console.log("wrote tokens.json"); }
else { let cur = null; try { cur = readFileSync(new URL("tokens.json", dir), "utf8"); } catch {} if (cur !== jsonText) fail("tokens.json is out of date with tokens.css (run npm run build)"); }
if (process.argv.includes("--strict") && warned) fail(`${warned} warning(s) with --strict`);
console.log(bad ? `${bad} problem(s)` : `ok: ${P.length + diseases.length * 5} contrast pairs + accent/globe mirrors consistent + disease day/night complete + tokens.json up to date${warned ? ` (${warned} warning(s))` : ""}`);
process.exit(bad ? 1 : 0);
