# @cnalks/design-tokens

**中文** · 共享设计令牌：配色（浅色默认 + 深色）、动效、WebGL 地球调色板，供 [cnalks.cn](https://www.cnalks.cn) 与 *Global Health Signals*（`ai4health-global`）共用。
**English** · Shared design tokens — colour (light by default + dark), motion and the WebGL globe palette — used by cnalks.cn and Global Health Signals.

| 文件 / File | 内容 / What |
|---|---|
| `tokens.css` | `html[data-theme="light\|dark"]` 语义色；`--accent` 蓝＝交互，`--data` 青＝被测量的量，`--event` 琥珀＝事件；`--sea-*` 深海带；`--globe-*` 地球；`--bridge` 柔和过渡 |
| `motion.css` | 缓动 `--ease-out / --ease-apple`、6 档时长 `--dur-*`、`.reveal`、`[data-rise]`、`.lift/.press`、统一 reduced-motion |
| `reveal.ts` | `initReveal()`：滚动入场；首屏元素不隐藏（不闪烁）；reduced-motion 下不做任何事 |
| `globe-colors.ts` | `readGlobePalette()`（从 `--globe-*` 读取 → shader uniform）、`ACCENT` 疾病色 |
| `--accent`/`--data` 区分 | 链接、按钮、焦点用 `--accent*`；图表、信号、品牌标记用 `--data`；选择疾病用 `data-accent="ebola"` 或 `setProperty("--data", …)` |
| `tokens.json` | 由 `tokens.css` 生成的机器可读副本 |
| `scripts/check.mjs` | `npm run check`：WCAG 对比度 + `globe-colors.ts` / `tokens.json` 防漂移 |

## 用法 / Usage

```sh
npm i github:CNalks/design-tokens#v0.1.0
```

```css
@import "@cnalks/design-tokens/tokens.css";
@import "@cnalks/design-tokens/motion.css";
```

```ts
import { initReveal } from "@cnalks/design-tokens/reveal";
import { readGlobePalette, ACCENT } from "@cnalks/design-tokens/globe-colors";
initReveal({ filter: (el) => !el.closest("[data-hero]") });
```

- 主题：`<html data-theme="light">`（默认）或 `"dark"`。 / Theme: `<html data-theme="light">` (default) or `"dark"`.
- 深海带是**区块类型**而非主题：`.band-sea` 默认跟随主题（暗→夜空，亮→晨光）；`.band-sea--night` 在任何主题下固定为深海夜空；`.band-sea--dawn` 固定为晨光。用 `.band-bridge`（`--bridge`）柔和接入页面，避免黑白硬切。
  *Sea band is a section type, not a theme: it follows the theme by default; pin it with `.band-sea--night` / `.band-sea--dawn`, and blend into the page with `var(--bridge)`.*
- 深海带配方 / Recipe（固定夜空放进浅色页面时，桥也要带同一个类，才会用同一片海的颜色）:
  ```html
  <div class="band-bridge-in band-sea--night" style="height:200px"></div>   <!-- 页面 → 夜空 / page → night -->
  <section class="band-sea band-sea--night">…</section>
  <div class="band-bridge band-sea--night" style="height:240px"></div>      <!-- 夜空 → 页面 / night → page -->
  ```
  `--page-bg` 始终是当前主题的页面底色，桥据此渐变。 / `--page-bg` is always the active theme's page background; the bridges blend into it.
- 颜色不编码风险；`--ok/--watch/--warn/--alert` 仅供确需风险语义的页面。 / Colour never encodes risk; the `--ok/--watch/--warn/--alert` set is opt-in.
- 该包以 `.ts` 源码发布，由 Vite/Astro 等打包器转译。 / Ships `.ts` sources; use it through a bundler (Vite/Astro/esbuild).

## 版本 / Versioning
语义化版本，以 git tag 发布（`v0.1.0` …）；升级即修改依赖里的 tag。 / Semver via git tags; upgrading = bumping the tag in the dependency.

## 许可 / License
Apache-2.0 — Copyright 2026 [CNalks](https://github.com/CNalks)
