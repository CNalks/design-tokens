/**
 * @cnalks/design-tokens · reveal.ts · v0.1.0 — shared scroll reveal (Apache-2.0).
 * Pair with motion.css. Rules:
 *  - nothing is hidden unless this function runs, motion is allowed and IntersectionObserver exists (progressive enhancement);
 *  - only blocks that START BELOW the first screen are hidden, so hero / first-screen content never flashes;
 *  - siblings stagger by --stagger (default 70 ms, capped at 5 steps); prefers-reduced-motion: reduce -> no-op, content stays visible.
 */
export interface RevealOptions {
  /** elements to reveal (default ".reveal, [data-reveal]") */
  selector?: string;
  /** extra exclusion test, e.g. (el) => !el.closest("[data-pulse]") */
  filter?: (el: HTMLElement) => boolean;
  /** fraction of the viewport height below which an element counts as "below the fold" (default 0.92) */
  fold?: number;
  /** override the IntersectionObserver bottom margin (default reads --reveal-margin, -8%) */
  rootMargin?: string;
}

export function initReveal(opts: RevealOptions = {}): () => void {
  const noop = () => {};
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return noop;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return noop;
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const stagger = parseFloat(cs.getPropertyValue("--stagger")) || 70;
  const margin = opts.rootMargin ?? (cs.getPropertyValue("--reveal-margin").trim() || "-8%");
  const fold = opts.fold ?? 0.92;
  const els = [...document.querySelectorAll<HTMLElement>(opts.selector ?? ".reveal, [data-reveal]")].filter(
    (e) => !e.parentElement?.closest(".reveal") && e.getBoundingClientRect().top > window.innerHeight * fold && (opts.filter ? opts.filter(e) : true),
  );
  if (!els.length) return noop;
  const show = (t: Element) => { t.classList.add("is-in"); io.unobserve(t); };
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        // intersecting now, or scrolled past before it ever intersected (anchor jump): reveal either way
        if (en.isIntersecting || en.boundingClientRect.top < 0) show(en.target);
      }
    },
    { rootMargin: `0px 0px ${margin} 0px` },
  );
  const per = new Map<Element, number>();
  for (const e of els) {
    const p = e.parentElement as Element, k = per.get(p) ?? 0;
    per.set(p, k + 1);
    e.style.setProperty("--rd", `${Math.min(k, 5) * stagger}ms`);
    e.classList.add("reveal");
    io.observe(e);
  }
  root.classList.add("reveal-ready");
  return () => { io.disconnect(); root.classList.remove("reveal-ready"); for (const e of els) e.classList.remove("reveal", "is-in"); };
}
