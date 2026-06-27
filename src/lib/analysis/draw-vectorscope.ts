// Cb/Cr vectorscope drawing for the Inspector (Slice 12). The pure shaping
// (`densityToBrightness`, `cellColor`) is unit-tested; `drawVectorscope` is
// canvas glue (Slice-5/7/8 pattern). Grid cells are tinted with the colour
// that chroma represents (reconstructed RGB at Y=0.5), with brightness on a
// sqrt scale + gain. At 512×512 cells are sub-pixel on the Inspector canvas,
// so no blur is needed; the lighter composite accumulates adjacent cells into smooth traces.

import type { Vectorscope } from "../types";
import type { Reading } from "../stores/eyedropper";

/** Detect the dominant colour harmony from a vectorscope density grid.
 *  Builds a chroma-weighted hue histogram, finds dominant peaks, and
 *  classifies their angular relationships using standard colour-theory terms. */
export function detectColorScheme(scope: Vectorscope): string {
  const { size, cells } = scope;

  // 36-bin × 10° hue histogram weighted by count × chroma.
  // Skip near-neutral cells (chroma < 0.07) — they carry no hue signal.
  const bins = new Float64Array(36);
  let totalWeight = 0;
  for (const [gx, gy, count] of cells) {
    const cb = (gx + 0.5) / size - 0.5;
    const cr = (gy + 0.5) / size - 0.5;
    const chroma = Math.sqrt(cb * cb + cr * cr);
    if (chroma < 0.07) continue;
    const angle = ((Math.atan2(cr, cb) * 180 / Math.PI) + 360) % 360;
    const w = count * chroma;
    bins[Math.floor(angle / 10) % 36] += w;
    totalWeight += w;
  }
  if (totalWeight === 0) return "Neutral";

  // 3-bin circular smooth to avoid splitting a single peak across two bins
  const smooth = Float64Array.from({ length: 36 }, (_, i) =>
    (bins[i] + bins[(i + 1) % 36] + bins[(i + 35) % 36]) / 3
  );
  const peakVal = Math.max(...smooth);
  const threshold = peakVal * 0.20;

  // Collect local maxima above threshold
  const raw: number[] = [];
  for (let i = 0; i < 36; i++) {
    if (smooth[i] > threshold &&
        smooth[i] >= smooth[(i + 35) % 36] &&
        smooth[i] > smooth[(i + 1) % 36]) {
      raw.push(i * 10 + 5);
    }
  }

  // Merge peaks within 30° of each other
  const used = new Array(raw.length).fill(false);
  const peaks: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let sum = raw[i], cnt = 1;
    for (let j = i + 1; j < raw.length; j++) {
      if (used[j]) continue;
      const d = Math.abs(raw[i] - raw[j]);
      if (Math.min(d, 360 - d) < 30) { sum += raw[j]; cnt++; used[j] = true; }
    }
    peaks.push(sum / cnt);
  }

  return classifyByPeaks(peaks);
}

/** Shortest arc between two angles (0..180) */
function angularDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function classifyByPeaks(peaks: number[]): string {
  const n = peaks.length;
  if (n === 0) return "Neutral";
  if (n === 1) return "Monochromatic";

  const dists: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      dists.push(angularDist(peaks[i], peaks[j]));
  const minD = Math.min(...dists);
  const maxD = Math.max(...dists);

  if (n === 2) {
    if (maxD > 150) return "Complementary";
    if (maxD < 65)  return "Analogous";
    return "Split-Complementary";
  }
  if (n === 3) {
    if (maxD < 65)  return "Analogous";
    if (minD > 70)  return "Triadic";           // all ~120° apart
    return "Split-Complementary";
  }
  if (n === 4 && minD > 60) return "Tetradic";
  return "Polychromatic";
}

const BG = "#141414";
const GRATICULE = "rgba(255, 255, 255, 0.12)";
const HOVER = "#ffa233"; // amber, shared with histogram's hover colour

// 75% saturation target positions (Cb, Cr) + display colour + label.
// Derived from Rec.709 primaries at full saturation, scaled by 0.75.
const TARGETS = [
  { label: "R", cb: -0.0860, cr: 0.3750, color: "rgba(255,80,80,0.7)" },
  { label: "Y", cb: -0.3750, cr: 0.0344, color: "rgba(220,220,0,0.7)" },
  { label: "G", cb: -0.2892, cr: -0.3405, color: "rgba(60,200,60,0.7)" },
  { label: "C", cb: 0.0860, cr: -0.3750, color: "rgba(60,200,200,0.7)" },
  { label: "B", cb: 0.3750, cr: -0.0344, color: "rgba(80,80,255,0.7)" },
  { label: "M", cb: 0.2892, cr: 0.3405, color: "rgba(200,60,200,0.7)" },
] as const;

// ponytail: tuning knob. At GAIN=10 cells reach full brightness at 1% of
// maxCount (sqrt(0.01)×10=1). Lower → only dense clusters show; raise toward
// 75–100 for DaVinci-style bright-everywhere look.
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
  // Near-black circle fill
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  ctx.fill();

  const { size, cells } = scope;
  let maxCount = 0;
  for (const [,, c] of cells) if (c > maxCount) maxCount = c;

  // "lighter" (additive) blending: dense clusters accumulate toward white.
  // At 512 grid cells are ~0.4 CSS px apart but rendered at 1 CSS px each,
  // so adjacent cells heavily overlap and blend into smooth bright traces.
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

  // Graticule: bounding circle, centre cross, tick marks, target brackets
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 0.5;

  ctx.strokeStyle = GRATICULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Centre cross
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, h);
  ctx.moveTo(0, cy + 0.5); ctx.lineTo(w, cy + 0.5);
  ctx.stroke();

  // Radial tick marks every 10°, slightly longer every 30°
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const major = deg % 30 === 0;
    const inner = r * (major ? 0.92 : 0.95);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
    ctx.lineTo(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r);
    ctx.stroke();
  }

  // Target bracket markers at 75% saturation for R, G, B, Y, C, M
  const bArm = Math.max(4, Math.min(w, h) * 0.028); // ~5-6px on typical canvas
  const bLen = bArm * 0.55;
  for (const { label, cb: tcb, cr: tcr, color } of TARGETS) {
    const bx = (tcb * zoom + 0.5) * w;
    const by = (0.5 - tcr * zoom) * h;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    // 4 corner brackets
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const ox = bx + sx * bArm / 2;
      const oy = by + sy * bArm / 2;
      ctx.beginPath();
      ctx.moveTo(ox - sx * bLen, oy);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox, oy - sy * bLen);
      ctx.stroke();
    }
    // Label
    ctx.fillStyle = color;
    ctx.font = `${Math.max(8, Math.round(Math.min(w, h) * 0.048))}px monospace`;
    ctx.textAlign = bx < cx ? "right" : "left";
    ctx.textBaseline = by < cy ? "bottom" : "top";
    const lx = bx + (bx < cx ? -bArm * 0.7 : bArm * 0.7);
    const ly = by + (by < cy ? -bArm * 0.7 : bArm * 0.7);
    ctx.fillText(label, lx, ly);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 1;

  // Amber crosshair at the eyedropper's Cb/Cr position (zoom-scaled)
  if (reading) {
    const rn = reading.r / 255;
    const gn = reading.g / 255;
    const bn = reading.b / 255;
    const y = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
    const ecb = (bn - y) / 1.8556;
    const ecr = (rn - y) / 1.5748;
    const ex = (ecb * zoom + 0.5) * w;
    const ey = (0.5 - ecr * zoom) * h;
    const arm = 6;
    ctx.strokeStyle = HOVER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex - arm, ey + 0.5);
    ctx.lineTo(ex + arm, ey + 0.5);
    ctx.moveTo(ex + 0.5, ey - arm);
    ctx.lineTo(ex + 0.5, ey + arm);
    ctx.stroke();
  }
}
