// Cb/Cr vectorscope drawing for the Inspector (Slice 12). The pure shaping
// (`densityToBrightness`, `cellColor`) is unit-tested; `drawVectorscope` is
// canvas glue (Slice-5/7/8 pattern). Grid cells are tinted with the colour
// that chroma represents (reconstructed RGB at Y=0.5), with brightness on a
// sqrt scale + gain. At 512×512 cells are sub-pixel on the Inspector canvas,
// so no blur is needed for smoothness.

import type { Vectorscope } from "../types";
import type { Reading } from "../stores/eyedropper";

const BG = "#141414";
const GRATICULE = "rgba(255, 255, 255, 0.12)";
const HOVER = "#ffa233"; // amber, shared with histogram's hover colour

// ponytail: tuning knob — raise to show dimmer chroma trails, lower to show
// only the strongest clusters. At GAIN=5 cells reach full brightness at ~4%
// of the max cell count, so the neutral centre and saturated colour blobs are
// both clearly visible without blowing out to pure white.
const GAIN = 10;

/** Sqrt-scale brightness for a density count: 0 → 0, maxCount → 1.
 *  sqrt gives a 7:1 ratio between max and a 2%-of-max cell (vs log's 2:1),
 *  so noise cells (~1% of max) fall to <10% brightness and vanish on the
 *  dark background, while hot clusters stay near full brightness. Pure. */
export function densityToBrightness(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) return 0;
  return Math.sqrt(count / maxCount);
}

/** sRGB [0..255] for the colour that cell (gx, gy) represents — reconstructed
 *  at Y=0.5 (mid-luma) from the cell's Cb/Cr so the tint reads as its actual
 *  hue. Channels are clamped to valid sRGB before rounding. Pure. */
export function cellColor(gx: number, gy: number, size: number): [number, number, number] {
  const cb = (gx + 0.5) / size - 0.5;
  const cr = (gy + 0.5) / size - 0.5;
  const r = Math.max(0, Math.min(1, cr * 1.5748 + 0.5));
  const b = Math.max(0, Math.min(1, cb * 1.8556 + 0.5));
  const g = Math.max(0, Math.min(1, (0.5 - 0.2126 * r - 0.0722 * b) / 0.7152));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Draw the Cb/Cr vectorscope into `ctx` (sized `w`×`h` in CSS px).
 *  Caller has already applied any device-pixel-ratio transform.
 *  `reading` null ⇒ no hover crosshair.
 *  `zoom` 2 doubles every signal's distance from centre (Resolve-style). */
export function drawVectorscope(
  ctx: CanvasRenderingContext2D,
  scope: Vectorscope,
  w: number,
  h: number,
  reading: Reading | null,
  zoom: 1 | 2 = 1
) {
  ctx.clearRect(0, 0, w, h);

  // Near-black circle fill
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  ctx.fill();

  // Max density across non-zero cells for brightness scaling.
  const { size, cells } = scope;
  let maxCount = 0;
  for (const [,, c] of cells) if (c > maxCount) maxCount = c;

  // Draw each non-zero cell with additive blending + blur. "lighter" makes
  // dense clusters accumulate light into bright cores. At 512×512 cells are
  // sub-pixel on the Inspector canvas, so there are no visible squares even
  // without blur; the blur(3px) adds the soft glow halo.
  // Grid: gx=Cb (yellow→blue), gy=Cr (cyan→red).
  // Canvas: x=gx, y=(size-1-gy) so positive Cr (red) is at the top.
  // "lighter" (additive) blending: each cell adds its light to the canvas
  // instead of painting over it. Sub-pixel cells at 512×512 share device
  // pixels at fractional positions, so adjacent dense cells accumulate and
  // blow out toward white — headroom that source-over can't provide.
  //
  // At zoom=2 every cell's Cb/Cr is scaled 2× from centre before mapping to
  // canvas coordinates, so cells beyond ±0.25 go off-canvas and are skipped.
  const baseW = w / size;
  const baseH = h / size;
  const zW = Math.ceil(baseW * zoom);
  const zH = Math.ceil(baseH * zoom);
  ctx.globalCompositeOperation = "lighter";
  for (const [gx, gy, count] of cells) {
    const cb = (gx + 0.5) / size - 0.5;
    const cr = (gy + 0.5) / size - 0.5;
    const px = (cb * zoom + 0.5) * w - zW / 2;
    const py = (0.5 - cr * zoom) * h - zH / 2;
    if (px + zW < 0 || px > w || py + zH < 0 || py > h) continue;
    const bright = Math.min(1, densityToBrightness(count, maxCount) * GAIN);
    const [r, g, b] = cellColor(gx, gy, size);
    ctx.fillStyle = `rgba(${r},${g},${b},${bright})`;
    ctx.fillRect(px, py, zW, zH);
  }
  ctx.globalCompositeOperation = "source-over";

  // Graticule: bounding circle + faint centre cross
  ctx.strokeStyle = GRATICULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w / 2 + 0.5, 0);
  ctx.lineTo(w / 2 + 0.5, h);
  ctx.moveTo(0, h / 2 + 0.5);
  ctx.lineTo(w, h / 2 + 0.5);
  ctx.stroke();

  // Amber crosshair at the eyedropper's Cb/Cr position (zoom-scaled)
  if (reading) {
    const rn = reading.r / 255;
    const gn = reading.g / 255;
    const bn = reading.b / 255;
    const y = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
    const cb = (bn - y) / 1.8556;
    const cr = (rn - y) / 1.5748;
    const cx = (cb * zoom + 0.5) * w;
    const cy = (0.5 - cr * zoom) * h;
    const arm = 6;
    ctx.strokeStyle = HOVER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy + 0.5);
    ctx.lineTo(cx + arm, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - arm);
    ctx.lineTo(cx + 0.5, cy + arm);
    ctx.stroke();
  }
}
