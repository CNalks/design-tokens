/**
 * @cnalks/design-tokens · globe-colors.ts · v0.1.0 — single colour source for the WebGL globe (Apache-2.0).
 * The shader never hard-codes colours: it takes uniforms filled from the --globe-* CSS tokens (night + day palettes, both
 * always defined; the shader blends them with its uMode uniform). Call readGlobePalette() at start-up and again after a
 * theme change (document event "ghs:theme" in GHS) in case a theme overrides the tokens.
 */
export type RGB = [number, number, number];

/** Pairs of [night, day] where the palette is mode-dependent. All channels 0..1, sRGB (the same space the shader blends in). */
export interface GlobePalette {
  night: Record<GlobeKey, RGB>;
  day: Record<GlobeKey, RGB>;
}
export type GlobeKey = "deep" | "ocean" | "rim" | "halo" | "spec" | "dotLo" | "dotHi" | "sparkle" | "event";

const TOKEN: Record<GlobeKey, string> = { deep: "deep", ocean: "ocean", rim: "rim", halo: "halo", spec: "spec", dotLo: "dot-lo", dotHi: "dot-hi", sparkle: "sparkle", event: "event" };
/** Fallbacks = the values in tokens.css (used on the server, in tests, or if a token is missing). */
const FALLBACK: GlobePalette = {
  night: { deep: [0.0118, 0.0353, 0.0627], ocean: [0.0627, 0.1686, 0.2588], rim: [0.4235, 0.8431, 0.8902], halo: [0.4235, 0.8431, 0.8902], spec: [0.549, 0.7804, 0.902], dotLo: [0.2196, 0.4196, 0.5216], dotHi: [0.902, 0.949, 0.9294], sparkle: [0.251, 0.549, 0.6], event: [0.9137, 0.6902, 0.451] },
  day: { deep: [0.7255, 0.8275, 0.8941], ocean: [0.902, 0.9373, 0.9608], rim: [0.5608, 0.7059, 0.8157], halo: [0.5608, 0.7059, 0.8157], spec: [1, 1, 1], dotLo: [0.4353, 0.5412, 0.6392], dotHi: [0.1137, 0.1843, 0.2706], sparkle: [0.251, 0.549, 0.6], event: [0.5412, 0.2902, 0.0196] },
};

let cv: CanvasRenderingContext2D | null = null;
/** Any CSS colour (hex, rgb(), color-mix(), oklch ...) -> 0..1 RGB. Hex is parsed directly; everything else is normalised through a 1x1 canvas. */
export function parseColor(css: string): RGB | null {
  const s = css.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  if (!s || typeof document === "undefined") return null;
  cv ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!cv) return null;
  cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = s; cv.fillRect(0, 0, 1, 1);
  const d = cv.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

export function readGlobePalette(root: Element = document.documentElement): GlobePalette {
  const cs = getComputedStyle(root);
  const out: GlobePalette = { night: { ...FALLBACK.night }, day: { ...FALLBACK.day } };
  for (const mode of ["night", "day"] as const) {
    for (const k of Object.keys(TOKEN) as GlobeKey[]) {
      const c = parseColor(cs.getPropertyValue(`--globe-${mode}-${TOKEN[k]}`));
      if (c) out[mode][k] = c;
    }
  }
  return out;
}

/** Page background / ink as 0..1 RGB, handy for posters and tests. */
export const readToken = (name: string, root: Element = document.documentElement): RGB | null => parseColor(getComputedStyle(root).getPropertyValue(name));

/**
 * One accent hue per disease (night = bright on the deep-sea globe, day = ink-dark on the morning-light globe).
 * Mirrors the --d-* tokens in tokens.css (npm run check keeps them in sync). Hues are ~30-40 degrees apart in OKLCH;
 * colour only says WHICH disease is shown, never risk.
 */
export const ACCENT: Record<string, { night: string; day: string }> = {
  influenza: { night: "#6cd7e3", day: "#006c76" },
  polio: { night: "#6bc8ff", day: "#005e9d" },
  diphtheria: { night: "#9bbaff", day: "#3750a5" },
  covid19: { night: "#caabff", day: "#654199" },
  rubella: { night: "#f29eda", day: "#873273" },
  measles: { night: "#ff9bae", day: "#942c49" },
  ebola: { night: "#ff6c5d", day: "#a21b18" },
  dengue: { night: "#ffb04a", day: "#8f5300" },
  cholera: { night: "#d0bf59", day: "#6b5700" },
  pertussis: { night: "#a6cd73", day: "#416500" },
  malaria: { night: "#64d7aa", day: "#006f44" },
};
export const hexToRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const accentOf = (id: string, mode: "night" | "day") => (ACCENT[id] ?? ACCENT.influenza)[mode];
