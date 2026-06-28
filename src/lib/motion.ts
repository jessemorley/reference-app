// Shared motion helpers. Native Svelte transitions only (no Framer/Motion dep —
// Framer Motion is React-only). Everything is gated on the OS reduced-motion
// preference so each animation collapses to an instant cut when the user asks
// for less motion — same contract as the CSS @media guards already in the grids.
import { fly, crossfade } from "svelte/transition";
import { cubicOut } from "svelte/easing";

const reduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Duration in ms, collapsed to 0 when the user prefers reduced motion. */
export const dur = (ms: number) => (reduced() ? 0 : ms);

/** Staggered tile entrance for the grids. `index` delays each tile a touch so a
 *  fresh set cascades in; capped so long grids don't wait seconds for the tail. */
export const gridIn = (
  node: Element,
  { index = 0 }: { index?: number } = {}
) =>
  fly(node, {
    y: 8,
    duration: dur(220),
    delay: dur(Math.min(index, 24) * 15),
    easing: cubicOut,
  });

/** Shared send/receive pair for the sliding active-pill indicators. One instance
 *  serves every pill group — the `key` namespaces them (`tab`, `seg`), and only
 *  one element per key is mounted at a time, so the highlight glides from the old
 *  active to the new instead of cutting. */
export const [pillSend, pillReceive] = crossfade({
  duration: () => dur(180),
  easing: cubicOut,
});
