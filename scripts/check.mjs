#!/usr/bin/env node
// Drift + contrast guard. Parses tokens.css (light / dark / sea / globe / disease), checks WCAG pairs, and checks that
// globe-colors.ts (ACCENT + fallbacks) matches the CSS. `--write` regenerates tokens.json from tokens.css.
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../", import.meta.url);
const css = readFileSync(new URL("tokens.css", dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// ---- tiny CSS parser: rule blocks -> selector list -> declarations
const blocks = [];
for (const m of css.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
  const sels = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  const decl = {};
  for (const d of m[2].split(";")) { const i = d.indexOf(":"); if (i > 0 && d.trim().startsWith("--")) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  if (Object.keys(decl).length) blocks.push({ sels, decl });
}
const scope = (names) => { const o = {}; for (const b of blocks) if (b.sels.some((s) => names.includes(s))) Object.assign(o, b.decl); return o; };
const light = scope([":root", ':root[data-theme="light"]']);
const dark = { ...light, ...scope([':root[data-theme="dark"]']) };
const dawn = { ...light, ...scope([".band-sea--dawn"]) };
const night = { ...dark, ...scope([".band-sea--night"]) };
const modes = { light, dark, dawn, night };

const hex = (v) => { const m = /^#([0-9a-f]{6})$/i.exec(v); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
function resolve(v, env, depth = 0) {
  if (v == null || depth > 6) return null;
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim()); if (m) return resolve(env[m[1]], env, depth + 1);
  return v.trim();
}
function color(v, env, over) { // rgb array; rgba composited over `over`
  const r = resolve(v, env); if (!r) return null; const h = hex(r); if (h) return h;
  const m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(r);
  if (!m) return null; const a = m[4] == null ? 1 : +m[4], c = [+m[1], +m[2], +m[3]];
  return over ? c.map((x, i) => Math.round(x * a + over[i] * (1 - a))) : c;
}
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// [mode, fg, bg, min]
const P = [];
for (const m of ["light", "dark"]) {
  P.push(
    [m, "ink", "bg", 7], [m, "ink-2", "bg", 7], [m, "muted", "bg", 4.5], [m, "ink", "panel", 7], [m, "muted", "panel", 4.5], [m, "muted", "bg-elev", 4.5],
    [m, "accent-ink", "bg", 4.5], [m, "accent-ink", "panel", 4.5], [m, "on-accent", "accent", 4.5], [m, "data", "bg", 4.5], [m, "data", "panel", 4.5], [m, "on-data", "data", 4.5],
    [m, "event-ink", "bg", 4.5], [m, "event-ink", "panel", 4.5], [m, "event", "bg", 3], [m, "indigo", "bg", 4.5], [m, "focus", "bg", 3], [m, "line-strong", "bg", 1.5],
  );
}
for (const m of ["dawn", "night"]) {
  P.push(
    [m, "sea-ink", "sea-1", 7], [m, "sea-ink", "sea-2", 7], [m, "sea-ink-2", "sea-1", 7], [m, "sea-muted", "sea-0", 4.5], [m, "sea-muted", "sea-2", 4.5],
    [m, "sea-event", "sea-0", 4.5], [m, "sea-event", "sea-2", 4.5], [m, "sea-warn", "sea-2", 4.5], [m, "data", "sea-0", 4.5], [m, "data", "sea-2", 4.5],
  );
}
// disease hues: night hues on the night band, day hues on the dawn band + page
const diseases = Object.keys(light).filter((k) => k.startsWith("--d-")).map((k) => k.slice(4));
let bad = 0; const fail = (msg) => { bad++; console.log("FAIL", msg); };
for (const [m, fg, bg, min] of P) {
  const env = modes[m]; const b = color(env["--" + bg], env), f = color(env["--" + fg], env, b);
  if (!b || !f) { fail(`${m}: cannot resolve ${fg} / ${bg}`); continue; }
  const r = ratio(f, b); if (r < min) fail(`${m}: ${fg} on ${bg} = ${r.toFixed(2)} < ${min}`);
}
for (const id of diseases) {
  const n = hex(dark["--d-" + id]), d = hex(light["--d-" + id]);
  for (const [name, c, bgs, env, min] of [["night", n, ["--sea-0", "--sea-2"], night, 4.5], ["day", d, ["--sea-0", "--sea-2", "--bg"], dawn, 4.5], ["day", d, ["--panel"], light, 4.5]]) {
    for (const bg of bgs) { const r = ratio(c, color(env[bg], env)); if (r < min) fail(`disease ${id} ${name} on ${bg} = ${r.toFixed(2)}`); }
  }
}
// accent.ts mirror
const ts = readFileSync(new URL("globe-colors.ts", dir), "utf8");
const acc = Object.fromEntries([...ts.matchAll(/(\w+): \{ night: "(#[0-9a-f]{6})", day: "(#[0-9a-f]{6})" \}/g)].map((m) => [m[1], { night: m[2], day: m[3] }]));
for (const id of diseases) {
  if (!acc[id]) fail(`globe-colors.ts missing ACCENT.${id}`);
  else { if (acc[id].night !== dark["--d-" + id]) fail(`ACCENT.${id}.night != --d-${id} (dark)`); if (acc[id].day !== light["--d-" + id]) fail(`ACCENT.${id}.day != --d-${id} (light)`); }
}
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
if (process.argv.includes("--write")) {
  const json = { name: "@cnalks/design-tokens", version: JSON.parse(readFileSync(new URL("package.json", dir), "utf8")).version, themes: { light, dark }, sea: { dawn: Object.fromEntries(Object.entries(dawn).filter(([k]) => k.startsWith("--sea-"))), night: Object.fromEntries(Object.entries(night).filter(([k]) => k.startsWith("--sea-"))) }, disease: Object.fromEntries(diseases.map((id) => [id, { night: dark["--d-" + id], day: light["--d-" + id] }])), globe: Object.fromEntries(Object.entries(light).filter(([k]) => k.startsWith("--globe-"))) };
  writeFileSync(new URL("tokens.json", dir), JSON.stringify(json, null, 2) + "\n"); console.log("wrote tokens.json");
}
console.log(bad ? `${bad} problem(s)` : `ok: ${P.length + diseases.length * 5} contrast pairs + accent/globe mirrors consistent`);
process.exit(bad ? 1 : 0);
