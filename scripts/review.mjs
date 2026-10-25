#!/usr/bin/env node
// Change receipt: compares the working tree's tokens.css with a git baseline and prints, per scope, every token that was
// added, removed or changed (before -> after), then a coverage summary (disease day/night, ACCENT mirror, contrast check).
// Usage: npm run review [-- --base <git-ref>]   (default base: v0.1.0). Read-only: never writes files. Exit 0 = receipt
// printed (even if check fails; the check result is printed in the summary), 2 = baseline not readable.
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseBlocks, parseAtProperty, loadContract, pairsOf, diseaseAudit } from "./lib/tokens.mjs";

const dir = new URL("../", import.meta.url);
const root = fileURLToPath(dir);
const ai = process.argv.indexOf("--base");
const base = ai > 0 && process.argv[ai + 1] ? process.argv[ai + 1] : "v0.1.0";
const show = (file) => { try { return execFileSync("git", ["-C", root, "show", `${base}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24 }); } catch { return null; } };
const read = (file) => { try { return readFileSync(new URL(file, dir), "utf8"); } catch { return null; } };

const baseCss = show("tokens.css");
if (baseCss == null) { console.error(`review: cannot read tokens.css at base "${base}" (is it a valid git ref in ${root}?)`); process.exit(2); }
const headCss = read("tokens.css");
const LABEL = { ":root": "light (:root)", ':root[data-theme="light"]': "light", ':root[data-theme="dark"]': "dark", ".band-sea--night": ".band-sea--night", ".band-sea--dawn": ".band-sea--dawn" };
const label = (s) => LABEL[s] ?? s;

// selector -> { token: value } (later declarations win, exactly like the cascade within equal specificity)
function bySelector(css, key) {
  const o = new Map();
  for (const b of parseBlocks(css)) for (const s of b.sels) { if (!o.has(s)) o.set(s, {}); Object.assign(o.get(s), b[key]); }
  for (const [s, d] of o) if (!Object.keys(d).length) o.delete(s);
  return o;
}
function diff(a, b) { // Map<scope, {k: v}> x2 -> grouped rows
  const rows = new Map();
  const scopes = [...new Set([...a.keys(), ...b.keys()])];
  for (const s of scopes) {
    const x = a.get(s) ?? {}, y = b.get(s) ?? {};
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])]) {
      const before = x[k] ?? null, after = y[k] ?? null; if (before === after) continue;
      const kind = before == null ? "+" : after == null ? "-" : "~";
      const id = `${kind}\u0000${k}\u0000${before}\u0000${after}`;
      if (!rows.has(id)) rows.set(id, { kind, k, before, after, scopes: [] });
      rows.get(id).scopes.push(label(s));
    }
  }
  return [...rows.values()];
}
const tok = diff(bySelector(baseCss, "decl"), bySelector(headCss, "decl"));
const oth = diff(bySelector(baseCss, "other"), bySelector(headCss, "other"));
const ap = diff(new Map([["@property", parseAtProperty(baseCss)]]), new Map([["@property", parseAtProperty(headCss)]]));

const out = [];
out.push(`# design-tokens 变更收据 / change receipt`);
out.push(`基线 base: ${base}  ->  工作区 working tree`);
out.push("");
const FILES = ["tokens.css", "motion.css", "reveal.ts", "globe-colors.ts", "tokens.json"];
out.push("## 文件级 / files");
for (const f of FILES) { const b = show(f), h = read(f); out.push(`  ${b === h ? "=" : b == null ? "+" : h == null ? "-" : "~"} ${f}${b === h ? "  (与基线逐字节相同)" : b == null ? "  (基线无此文件)" : h == null ? "  (已删除)" : "  (有变化)"}`); }
out.push("");
const one = (v) => (v ?? "").replace(/\s+/g, " ");
const fmt = (r) => r.kind === "+" ? `  + ${r.k}: ${one(r.after)}   [${r.scopes.join(", ")}]` : r.kind === "-" ? `  - ${r.k}: ${one(r.before)}   [${r.scopes.join(", ")}]` : `  ~ ${r.k}: ${one(r.before)} -> ${one(r.after)}   [${r.scopes.join(", ")}]`;
out.push(`## tokens.css 自定义属性 / custom properties  (+${tok.filter((r) => r.kind === "+").length} -${tok.filter((r) => r.kind === "-").length} ~${tok.filter((r) => r.kind === "~").length})`);
if (!tok.length) out.push("  （无）");
// group by scope set so a reader sees "dark, .band-sea--night" together
const groups = new Map();
for (const r of tok) { const g = r.scopes.join(", "); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
for (const [g, rs] of groups) { out.push(`  作用域 scope: ${g}`); for (const r of rs) out.push("  " + fmt(r).replace(/   \[.*\]$/, "")); }
if (oth.length || ap.length) {
  out.push(""); out.push(`## 非 token 声明 / other declarations (@property, color-scheme, class rules)`);
  for (const r of [...ap, ...oth]) out.push(fmt(r));
}
out.push("");

// ---- coverage summary (current working tree)
const contract = loadContract(dir);
const P = pairsOf(contract);
const covered = new Set(P.flatMap(([, fg, bg]) => ["--" + fg, "--" + bg]));
const audit = diseaseAudit(parseBlocks(headCss), read("globe-colors.ts") ?? "");
out.push("## 覆盖汇总 / coverage summary");
const incomplete = audit.rows.filter((r) => !r.complete), unmirrored = audit.rows.filter((r) => !r.mirrored);
out.push(`  疾病色 night/day 齐全: ${incomplete.length ? "否 ✗ " + incomplete.map((r) => `${r.id}(day=${r.day ?? "缺"}, night=${r.night ?? "缺"}, band=${r.band ?? "缺"}, data-accent=${r.dataAccent ? "有" : "缺"})`).join("; ") : `是 ✓ (${audit.rows.length} 种: ${audit.ids.join(", ")})`}`);
out.push(`  globe-colors.ts ACCENT 镜像同步: ${unmirrored.length ? "否 ✗ " + unmirrored.map((r) => `${r.id}(ACCENT=${r.accent ? `${r.accent.night}/${r.accent.day}` : "缺"}, css=${r.night ?? "缺"}/${r.day ?? "缺"})`).join("; ") : "是 ✓"}`);
const touched = [...new Set(tok.filter((r) => r.kind !== "-").map((r) => r.k))];
const headVal = Object.fromEntries(tok.filter((r) => r.kind !== "-").map((r) => [r.k, r.after]));
const plainColor = (v) => /^(#[0-9a-f]{3,8}|rgba?\([^()]*\)|var\(--[\w-]+\))$/i.test((v ?? "").trim());
const how = (k) => k.startsWith("--d-") ? "对比度（疾病色固定规则 ×5）" : covered.has(k) ? "对比度（contract.json 对列表）" : k.startsWith("--globe-") ? "镜像（globe-colors.ts FALLBACK）" : !plainColor(headVal[k]) ? "不适用（非纯色值：渐变/阴影/数字等）" : null;
out.push(`  对比度检查: ${P.length} 对登记 + ${audit.rows.filter((r) => r.day != null || r.night != null).length} 种疾病色 ×5 = ${P.length + audit.rows.filter((r) => r.day != null || r.night != null).length * 5} 对`);
if (!touched.length) out.push("  本次新增/改动的 token: 无");
else {
  out.push(`  本次新增/改动的 token（${touched.length}）是否已进检查:`);
  for (const k of touched) out.push(`    ${!how(k) ? "✗ 未覆盖" : how(k).startsWith("不适用") ? "·" : "✓"} ${k}${how(k) ? " — " + how(k) : "（不在对比度对列表，也不是疾病色/地球色；若是文字或界面色请登记进 scripts/contract.json）"}`);
}
const ck = spawnSync(process.execPath, [fileURLToPath(new URL("scripts/check.mjs", dir))], { encoding: "utf8" });
const lines = (ck.stdout || "").trim().split("\n");
out.push(`  npm run check: ${ck.status === 0 ? "通过" : "失败"} — ${lines.at(-1)}`);
for (const l of lines.filter((l) => /^(FAIL|WARN)/.test(l))) out.push(`    ${l}`);
out.push("");
const zero = !tok.length && !oth.length && !ap.length;
if (zero && baseCss === headCss) out.push(`结论: 与基线零差异（tokens.css 与 ${base} 逐字节相同）`);
else if (zero) out.push(`结论: token 与基线零差异（tokens.css 仅注释/格式与 ${base} 不同）`);
else out.push(`结论: 有 ${tok.length} 处 token 变化、${oth.length + ap.length} 处其他声明变化（见上），请写进 CHANGELOG.md`);
console.log(out.join("\n"));
