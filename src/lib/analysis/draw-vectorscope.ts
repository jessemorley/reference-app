// Cb/Cr vectorscope drawing for the Inspector (Slice 12). The pure shaping
// (`densityToBrightness`, `cellColor`) is unit-tested; `drawVectorscope` is
// canvas glue (Slice-5/7/8 pattern). Grid cells are tinted with the colour
// that chroma represents (reconstructed RGB at Y=0.5), with brightness on a
// log scale so sparse chroma doesn't vanish next to dense neutrals.

import type { Vectorscope } from "../types";
import type { Reading } from "../stores/eyedropper";

const BG = "#141414";
const GRATICULE = "rgba(255, 255, 255, 0.12)";
const HOVER = "#ffa233"; // amber, shared with histogram's hover colour

/** Log-scale brightness for a density count: 0 → 0, maxCount → 1.
 *  log1p compresses the orders-of-magnitude span so dim chroma is still
 *  visible beside saturated hot spots. Pure. */
export function densityToBrightness(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) return 0;
  return Math.log1p(count) / Math.log1p(maxCount);
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
 *  `reading` null ⇒ no hover crosshair. */
export function drawVectorscope(
  ctx: CanvasRenderingContext2D,
  scope: Vectorscope,
  w: number,
  h: number,
  reading: Reading | null
) {
  ctx.clearRect(0, 0, w, h);

  // Near-black circle fill
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  ctx.fill();

  // Max density for log scaling (O(size²) scan, negligible for 128×128)
  let maxCount = 0;
  for (const c of scope.grid) if (c > maxCount) maxCount = c;

  // Draw each non-empty cell. Grid: gx=Cb (yellow→blue), gy=Cr (cyan→red).
  // Canvas: x=gx, y=(size-1-gy) so positive Cr (red) is at the top.
  const { size } = scope;
  const cellW = w / size;
  const cellH = h / size;
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const count = scope.grid[gy * size + gx];
      if (count === 0) continue;
      const bright = densityToBrightness(count, maxCount);
      const [r, g, b] = cellColor(gx, gy, size);
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.05, bright)})`;
      // min 0.05 alpha so every non-zero cell is visible even at low density
      ctx.fillRect(gx * cellW, (size - 1 - gy) * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }

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

  // Amber crosshair at the eyedropper's Cb/Cr position
  if (reading) {
    const rn = reading.r / 255;
    const gn = reading.g / 255;
    const bn = reading.b / 255;
    const y = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
    const cb = (bn - y) / 1.8556;
    const cr = (rn - y) / 1.5748;
    const cx = (cb + 0.5) * w;
    const cy = (0.5 - cr) * h; // flip: positive Cr toward top
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
