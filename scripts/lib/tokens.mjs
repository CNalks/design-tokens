// Shared, dependency-free helpers for check.mjs / review.mjs / contract-doc.mjs (Node 18+ standard library only).
// Parsing is intentionally the same tiny regex parser check.mjs has always used, so results do not change.
import { readFileSync } from "node:fs";

export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** tokens.css text -> [{ sels, decl, other }]; decl = custom properties (--*), other = plain declarations. */
export function parseBlocks(cssText) {
  const css = stripComments(cssText);
  const blocks = [];
  for (const m of css.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (/^property\s/.test(head)) continue; // the tail of "@property --x { ... }" (handled by parseAtProperty)
    const sels = head.split(",").map((s) => s.trim()).filter(Boolean);
    const decl = {}, other = {};
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":"); if (i <= 0) continue;
      const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim().replace(/\s+/g, " ");
      if (k.startsWith("--")) decl[k] = d.slice(i + 1).trim(); else other[k] = v;
    }
    if (Object.keys(decl).length || Object.keys(other).length) blocks.push({ sels, decl, other });
  }
  return blocks;
}
/** "@property --x { syntax: ...; initial-value: ... }" -> { "--x": "syntax: ...; inherits: ...; initial-value: ..." } */
export function parseAtProperty(cssText) {
  const o = {};
  for (const m of stripComments(cssText).matchAll(/@property\s+(--[\w-]+)\s*\{([^{}]*)\}/g)) o[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return o;
}

export const SCOPES = {
  light: [":root", ':root[data-theme="light"]'],
  dark: [':root[data-theme="dark"]'],
  night: [".band-sea--night"],
  dawn: [".band-sea--dawn"],
};
export const scope = (blocks, names) => { const o = {}; for (const b of blocks) if (b.sels.some((s) => names.includes(s))) Object.assign(o, b.decl); return o; };
/** The four resolved environments check.mjs has always used. */
export function modesOf(blocks) {
  const light = scope(blocks, SCOPES.light);
  const dark = { ...light, ...scope(blocks, SCOPES.dark) };
  const dawn = { ...light, ...scope(blocks, SCOPES.dawn) };
  const night = { ...dark, ...scope(blocks, SCOPES.night) };
  return { light, dark, dawn, night };
}

export const hex = (v) => { const m = /^#([0-9a-f]{6})$/i.exec(v ?? ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
export function resolve(v, env, depth = 0) {
  if (v == null || depth > 6) return null;
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim()); if (m) return resolve(env[m[1]], env, depth + 1);
  return v.trim();
}
export function color(v, env, over) { // rgb array; rgba composited over `over`
  const r = resolve(v, env); if (!r) return null; const h = hex(r); if (h) return h;
  const m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(r);
  if (!m) return null; const a = m[4] == null ? 1 : +m[4], c = [+m[1], +m[2], +m[3]];
  return over ? c.map((x, i) => Math.round(x * a + over[i] * (1 - a))) : c;
}
export const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** globe-colors.ts ACCENT -> { id: { night, day } } */
export const parseAccent = (ts) => Object.fromEntries([...ts.matchAll(/(\w+): \{ night: "(#[0-9a-f]{6})", day: "(#[0-9a-f]{6})" \}/g)].map((m) => [m[1], { night: m[2], day: m[3] }]));

/** contract.json -> flat [mode, fg, bg, min] list, in the same order check.mjs has always used. */
export function pairsOf(contract) {
  const P = [];
  for (const g of contract.contrast) for (const m of g.modes) for (const [fg, bg, min] of g.pairs) P.push([m, fg, bg, min]);
  return P;
}
export const loadContract = (dir) => JSON.parse(readFileSync(new URL("scripts/contract.json", dir), "utf8"));

/** Raw (non-inherited) disease definitions per scope + ACCENT mirror + [data-accent] selector. */
export function diseaseAudit(blocks, ts) {
  const raw = { day: scope(blocks, SCOPES.light), dark: scope(blocks, [':root[data-theme="dark"]']), band: scope(blocks, [".band-sea--night"]) };
  const acc = parseAccent(ts);
  const sel = new Set(blocks.flatMap((b) => b.sels));
  const ids = [];
  for (const o of [raw.day, raw.dark, raw.band]) for (const k of Object.keys(o)) if (k.startsWith("--d-") && !ids.includes(k.slice(4))) ids.push(k.slice(4));
  for (const id of Object.keys(acc)) if (!ids.includes(id)) ids.push(id);
  const rows = [], problems = [];
  for (const id of ids) {
    const k = "--d-" + id;
    const r = { id, day: raw.day[k] ?? null, night: raw.dark[k] ?? null, band: raw.band[k] ?? null, accent: acc[id] ?? null, dataAccent: sel.has(`[data-accent="${id}"]`) };
    const css = r.day != null || r.night != null || r.band != null;
    if (css && r.day == null) problems.push(`disease ${id}: --d-${id} has no day value (:root / :root[data-theme="light"])`);
    if (css && r.night == null) problems.push(`disease ${id}: --d-${id} has no night value (:root[data-theme="dark"])`);
    if (css && r.band == null) problems.push(`disease ${id}: --d-${id} missing on .band-sea--night`);
    if (r.night != null && r.band != null && r.night !== r.band) problems.push(`disease ${id}: night value differs between :root[data-theme="dark"] (${r.night}) and .band-sea--night (${r.band})`);
    if (css && !r.dataAccent) problems.push(`disease ${id}: no [data-accent="${id}"] { --data: var(--d-${id}) } rule`);
    if (!r.accent) problems.push(`globe-colors.ts missing ACCENT.${id}`);
    else if (!css) problems.push(`globe-colors.ts ACCENT.${id} has no --d-${id} in tokens.css`);
    else {
      if (r.night != null && r.accent.night !== r.night) problems.push(`ACCENT.${id}.night != --d-${id} (dark)`);
      if (r.day != null && r.accent.day !== r.day) problems.push(`ACCENT.${id}.day != --d-${id} (light)`);
    }
    r.complete = css && r.day != null && r.night != null && r.band != null && r.dataAccent;
    r.mirrored = !!r.accent && r.accent.night === r.night && r.accent.day === r.day;
    rows.push(r);
  }
  return { ids, rows, problems };
}

/** Names that read as text foreground. Used only for a warning: such a token should appear as a contrast-pair foreground. */
export const TEXTLIKE = /(^|-)(ink|muted)(-\d+)?$|^on-/;
