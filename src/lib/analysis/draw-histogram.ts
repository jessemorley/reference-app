// Normalisation maths + Canvas drawing for the histogram (Slice 8). The pure
// shaping (`smooth`, `peak`) is unit-tested; `drawHistogram` is canvas glue (the
// Slice-5/7 pattern). Lightroom/Capture One-style look (see
// screenshots/captureone_hist.png): a filled grey L envelope with thin
// translucent R/G/B strokes on top, plus an amber hover line at the eyedropper's
// L value. A compressed (power-curve) vertical scale + light smoothing make the
// distribution *shape* read instead of one shadow spike dominating (raw linear
// walls the clipped bin-0/255 spikes — the Photoshop look in
// screenshots/our_hist.png; full log over-flattens to the C1 look).

import type { Histogram } from "../types";
import type { Reading } from "../stores/eyedropper";

// Channel stroke colours match the eyedropper readout (Inspector.svelte).
const CHANNELS = { r: "#ff6b6b", g: "#51cf66", b: "#5c9dff" };
const L_FILL = "rgba(255, 255, 255, 0.22)"; // grey luminosity envelope
const HOVER = "#ffa233"; // amber, visible over both the grey fill and white peaks
const BG = "#141414"; // near-black plot, darker than the #1e1e1e inspector chrome
const GRID = "rgba(255, 255, 255, 0.06)";

// Vertical scale exponent on the bin counts. 1.0 = linear, matching Photoshop
// (our source of truth): sparse dark/bright tails render near the floor so the
// luma curve only lifts where real density is, instead of climbing from the very
// edge. <1 compresses tall peaks (0.33 ≈ the Capture One look) but amplifies
// those sparse tails into visible height — measured wrong against PS. A tuning
// knob: drop toward 0.5 if you want peaks tamed and accept a lifted dark tail.
const SCALE_EXPONENT = 1.0;

// 5-tap smoothing kernel (weights, normalised at use) — de-jags per-bin noise
// into smooth curves so a single noisy bin doesn't stab the ceiling.
const SMOOTH_KERNEL = [1, 2, 3, 2, 1];

/** Smooth a channel's 256 bins with a small normalised kernel, clamping at the
 *  ends so a lone spike spreads into its neighbours instead of drawing as a
 *  needle. Pure. */
export function smooth(bins: number[], kernel = SMOOTH_KERNEL): number[] {
  const half = (kernel.length - 1) / 2;
  const weight = kernel.reduce((a, b) => a + b, 0);
  return bins.map((_, i) => {
    let sum = 0;
    for (let k = 0; k < kernel.length; k++) {
      const j = Math.min(bins.length - 1, Math.max(0, i + k - half));
      sum += bins[j] * kernel[k];
    }
    return sum / weight;
  });
}

/** The full-height reference value: the shared max across all given channels
 *  (not per-channel — keeps relative channel weight honest), clamped to ≥1 so
 *  callers can divide safely. Pure. */
export function peak(channels: number[][]): number {
  let m = 0;
  for (const ch of channels) for (const v of ch) if (v > m) m = v;
  return Math.max(1, m);
}

function channelPath(
  ctx: CanvasRenderingContext2D,
  bins: number[],
  xOf: (bin: number) => number,
  yOf: (count: number) => number
) {
  ctx.beginPath();
  bins.forEach((count, bin) => {
    const x = xOf(bin);
    const y = yOf(count);
    if (bin === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

/** Draw the four-channel histogram into `ctx` (sized `w`×`h` in CSS px). Caller
 *  has already applied any device-pixel-ratio transform. `reading` null ⇒ no
 *  hover line. */
export function drawHistogram(
  ctx: CanvasRenderingContext2D,
  hist: Histogram,
  w: number,
  h: number,
  reading: Reading | null
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Faint grid: vertical thirds, horizontal quarters. +0.5 keeps 1px lines crisp.
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    const x = Math.round((w * i) / 3) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < 4; i++) {
    const y = Math.round((h * i) / 4) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Smooth each channel, then scale to a shared max with the √ curve.
  const r = smooth(hist.r);
  const g = smooth(hist.g);
  const b = smooth(hist.b);
  const l = smooth(hist.l);
  const max = peak([r, g, b, l]);
  const xOf = (bin: number) => (bin / 255) * w;
  const yOf = (count: number) => h - Math.pow(Math.min(count / max, 1), SCALE_EXPONENT) * h;

  // L as a filled grey envelope underneath the colour strokes.
  channelPath(ctx, l, xOf, yOf);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = L_FILL;
  ctx.fill();

  // R/G/B as translucent strokes, lighten-blended so overlaps read white.
  ctx.globalCompositeOperation = "lighten";
  ctx.lineWidth = 1;
  for (const [colour, bins] of [
    [CHANNELS.r, r],
    [CHANNELS.g, g],
    [CHANNELS.b, b],
  ] as const) {
    channelPath(ctx, bins, xOf, yOf);
    ctx.strokeStyle = colour;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  // Amber line at the eyedropper's hovered L value.
  if (reading) {
    const x = Math.round(xOf(reading.l)) + 0.5;
    ctx.strokeStyle = HOVER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}
