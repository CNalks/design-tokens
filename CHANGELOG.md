# Changelog

本文件记录 @cnalks/design-tokens 的变更。格式参照 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循语义化版本，以 git tag 发布。
All notable changes to this package. Versions are git tags (`npm i github:CNalks/design-tokens#<tag>`).

## [Unreleased]

仅新增工具与文档；`tokens.css` / `motion.css` / `reveal.ts` / `globe-colors.ts` / `tokens.json` 与 v0.1.0 零差异，消费方外观不变。
Tooling and docs only — no token value, selector or export path changed.

### Added
- `scripts/review.mjs`（`npm run review [-- --base <ref>]`，默认基线 `v0.1.0`）：变更收据。与 git 基线比较 `tokens.css`，按作用域列出 token 新增 / 删除 / 前后取值，附文件级逐字节对比和覆盖汇总（疾病色 night/day 是否齐全、`globe-colors.ts` ACCENT 镜像是否同步、改动的 token 是否进了对比度/镜像检查、当前 `npm run check` 结果）；无变化时输出「与基线零差异」。只读。
- `scripts/contract.json`：对比度对列表（原样搬自 v0.1.0 的 `check.mjs`，56 对 + 疾病色 11×5 = 111 对）与「允许消费方局部覆盖」登记（目前仅 `--data`，依据 README）。
- `scripts/lib/tokens.mjs`：`check.mjs` / `review.mjs` / `contract-doc.mjs` 共用的解析与计算（与原 `check.mjs` 同一套解析）。
- `scripts/contract-doc.mjs`（`npm run contract-doc [-- --check]`）+ `docs/token-contract.md`：从 `tokens.css` 生成全部 token 的作用域、取值、注释用途与检查覆盖目录；无注释的用途 / 覆盖策略标「待补」；重复生成逐字节相同。
- `tests/gates.test.mjs`（`npm test`，`node --test`）：在临时目录副本中试验门禁，不改仓库文件。
- `.github/workflows/check.yml`：push / PR 时跑 `npm run check`、`npm test`、`npm run contract-doc -- --check`（Node 18 / 20 / 22）。

### Changed
- `scripts/check.mjs` 门禁加严（现有 token 全部通过，输出仍为 111 对）：
  - 任一 `--d-<id>` 缺 day 值、缺 night 值、`.band-sea--night` 未定义或与 dark 不一致、缺 `[data-accent="<id>"]` 规则、缺 `ACCENT.<id>` 镜像，或 `ACCENT` 有 CSS 中不存在的疾病 → 失败（原先只定义 night 的疾病色会被完全跳过）。
  - `tokens.json` 与 `tokens.css` 不一致 → 失败（原先只在 `--write` 时重写，不比对）。
  - 名字像文字色（`*-ink`、`*-muted`、`on-*`）却未作为前景登记进 `scripts/contract.json` 的 token → 警告；`--strict` 时失败。
  - 对比度对列表改为读取 `scripts/contract.json`（内容与顺序不变）。

## [0.1.0] - 2026-10-16

Tag `v0.1.0` → `9560d98`。

### Added
- `27435ed` 首个版本：`tokens.css`（浅色默认 + 深色语义色、`--accent` / `--data` / `--event` 角色、疾病色 `--d-*`、深海带 `--sea-*`、地球 `--globe-*`）、`motion.css`、`reveal.ts`、`globe-colors.ts`（`readGlobePalette()`、`ACCENT`）、`tokens.json`、`scripts/check.mjs`（WCAG 对比度 + 镜像检查，`npm run check` / `npm run build`）、README、Apache-2.0 LICENSE / NOTICE。
- `9560d98` 深海带 dawn / night 两种固定类（`.band-sea--dawn` / `.band-sea--night`）及 `--page-bg` 桥接（`--bridge` / `--bridge-in`、`.band-bridge-in`）、`--sea-shadow`、`--globe-day-spec`；调整白天地球调色板（`--globe-day-deep/ocean/rim/halo`）；`globe-colors.ts` 白天 FALLBACK 同步；`motion.css` 的 `.reveal-ready` 选择器改为 `:where(.reveal-ready)`（降低特异性，组件 hover 位移可覆盖）；`check.mjs` 要求 `--globe-day-spec` 存在；README 加深海带配方。
