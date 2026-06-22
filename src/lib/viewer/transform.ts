// Pure geometry for the Viewer (Slice 5). The viewer draws an image with a single
// affine transform `translate(tx, ty) scale(scale)` applied from the image's
// natural top-left, in CSS pixels of the viewport. Everything — initial fit,
// keyboard zoom, pan, clamping, and the source-pixel inverse the Slice-7
// eyedropper needs — is expressed against that one triple, so it stays testable
// and the eyedropper just inverts it (see ADR-0001, IMPLEMENTATION.md §Slices/5).

/** Viewport or image dimensions, in pixels. */
export type Size = { width: number; height: number };

/** A point in viewport CSS-pixel space (origin = viewport top-left). */
export type Point = { x: number; y: number };

/** The image transform: `scale` then `translate`, applied to the natural image.
 *  A natural-image point `p` lands at `p * scale + (tx, ty)` in the viewport. */
export type Transform = { scale: number; tx: number; ty: number };

/** Scale at which the whole image fits inside the viewport (contain), never
 *  enlarging past 1:1 — a small image opens at its natural size, centred, rather
 *  than blown up and soft. Degenerate sizes fall back to 1 so callers never get
 *  a zero or NaN scale. */
export function fitScale(viewport: Size, image: Size): number {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return 1;
  }
  const contain = Math.min(
    viewport.width / image.width,
    viewport.height / image.height
  );
  return Math.min(contain, 1);
}

/** The most you can zoom in: 1:1 source pixels for normal-to-large images, but at
 *  least 3× the fit so a small image (which fits below 1:1) can still be enlarged
 *  for inspection rather than being stuck at its open size. */
export function maxScale(fit: number): number {
  return Math.max(1, fit * 3);
}

/** Clamp a scale to `[fit, maxScale(fit)]` — fit is the floor (you can't zoom out
 *  past "whole image visible"). */
export function clampScale(scale: number, fit: number): number {
  return Math.min(Math.max(scale, fit), maxScale(fit));
}

/** The transform that fits `image` in `viewport`, centred. */
export function fitTransform(viewport: Size, image: Size): Transform {
  const scale = fitScale(viewport, image);
  return {
    scale,
    tx: (viewport.width - image.width * scale) / 2,
    ty: (viewport.height - image.height * scale) / 2,
  };
}

/** Zoom by `factor` about `anchor` (a viewport point), keeping whatever source
 *  pixel sits under the anchor fixed under it. The keyboard zoom passes the
 *  viewport centre; the parameter stays general so a future cursor-anchored zoom
 *  (or the eyedropper) reuses it. The resulting scale is clamped to `[fit, max]`,
 *  and the translation is rebalanced for the *actual* (post-clamp) scale so a
 *  zoom pinned at the limit doesn't drift. */
export function zoomToward(
  t: Transform,
  anchor: Point,
  factor: number,
  fit: number
): Transform {
  const next = clampScale(t.scale * factor, fit);
  // Source point under the anchor, held invariant: anchor = src*scale + translate.
  const ratio = next / t.scale;
  return {
    scale: next,
    tx: anchor.x - (anchor.x - t.tx) * ratio,
    ty: anchor.y - (anchor.y - t.ty) * ratio,
  };
}

/** Clamp the translation so the image can't be flung into empty backdrop. When an
 *  axis overflows the viewport (zoomed in) the image edges may not cross into the
 *  viewport — it stays covering. When it underflows (smaller than the viewport on
 *  that axis) it's pinned centred. Applied per axis independently. */
export function clampPan(t: Transform, viewport: Size, image: Size): Transform {
  return {
    scale: t.scale,
    tx: clampAxis(t.tx, viewport.width, image.width * t.scale),
    ty: clampAxis(t.ty, viewport.height, image.height * t.scale),
  };
}

function clampAxis(translate: number, viewport: number, scaled: number): number {
  if (scaled <= viewport) {
    // Smaller than the viewport on this axis: centre it.
    return (viewport - scaled) / 2;
  }
  // Larger: keep both edges outside the viewport (min = right/bottom flush,
  // max = left/top flush).
  const min = viewport - scaled;
  return Math.min(Math.max(translate, min), 0);
}

/** Page index `i` wrapped into `[0, len)`, so paging past either end wraps round.
 *  `len <= 0` yields 0 (no images — caller shouldn't be paging, but stay safe). */
export function wrapIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

/** Inverse of the transform: the natural-image (source) pixel under a viewport
 *  point. This is what the Slice-7 eyedropper reads to sample the right pixel
 *  regardless of zoom/pan; kept here and proven against `zoomToward` so the
 *  round-trip holds before the eyedropper depends on it. */
export function toSourcePixel(t: Transform, point: Point): Point {
  return {
    x: (point.x - t.tx) / t.scale,
    y: (point.y - t.ty) / t.scale,
  };
}
