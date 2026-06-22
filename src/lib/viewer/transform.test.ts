import { describe, it, expect } from "vitest";
import {
  fitScale,
  maxScale,
  clampScale,
  fitTransform,
  zoomToward,
  clampPan,
  wrapIndex,
  toSourcePixel,
  type Transform,
} from "./transform";

describe("fitScale", () => {
  it("contains a landscape image inside a square viewport (width-bound)", () => {
    expect(fitScale({ width: 100, height: 100 }, { width: 200, height: 50 })).toBe(
      0.5
    );
  });

  it("contains a portrait image inside a square viewport (height-bound)", () => {
    expect(fitScale({ width: 100, height: 100 }, { width: 50, height: 200 })).toBe(
      0.5
    );
  });

  it("never enlarges past 1:1 — a small image opens at natural size", () => {
    expect(fitScale({ width: 1000, height: 1000 }, { width: 100, height: 80 })).toBe(
      1
    );
  });

  it("falls back to 1 on degenerate sizes rather than 0/NaN", () => {
    expect(fitScale({ width: 0, height: 100 }, { width: 100, height: 100 })).toBe(1);
    expect(fitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
  });
});

describe("maxScale / clampScale", () => {
  it("caps at 1:1 for images that fit at or above natural size", () => {
    expect(maxScale(1)).toBe(3); // 3*fit dominates only below 1:1...
    expect(maxScale(0.25)).toBe(1); // ...here 1 dominates 0.75
  });

  it("lets a small image (fit < 1/3) still zoom to 3× its fit", () => {
    expect(maxScale(0.5)).toBe(1.5);
  });

  it("clamps to the [fit, max] band", () => {
    expect(clampScale(0.1, 0.5)).toBe(0.5); // floor = fit
    expect(clampScale(5, 0.5)).toBe(1.5); // ceiling = 3*fit
    expect(clampScale(0.8, 0.5)).toBe(0.8); // inside
  });
});

describe("fitTransform", () => {
  it("centres the scaled image in the viewport", () => {
    const t = fitTransform({ width: 100, height: 100 }, { width: 200, height: 50 });
    // scale 0.5 → scaled 100×25, centred → tx 0, ty 37.5
    expect(t.scale).toBe(0.5);
    expect(t.tx).toBe(0);
    expect(t.ty).toBe(37.5);
  });
});

describe("zoomToward", () => {
  const base: Transform = { scale: 1, tx: 0, ty: 0 };

  it("holds the anchored source pixel fixed under the anchor", () => {
    const anchor = { x: 40, y: 60 };
    const zoomed = zoomToward(base, anchor, 2, 1);
    // The source pixel under the anchor before and after must be identical.
    expect(toSourcePixel(base, anchor)).toEqual(toSourcePixel(zoomed, anchor));
    expect(zoomed.scale).toBe(2);
  });

  it("clamps the scale and rebalances translation for the post-clamp scale", () => {
    // Ask for 8× but max is 3×fit = 3 (fit 1). Translation must match scale 3,
    // not the requested 8, so the anchor stays put without drift.
    const anchor = { x: 50, y: 50 };
    const zoomed = zoomToward(base, anchor, 8, 1);
    expect(zoomed.scale).toBe(3);
    expect(toSourcePixel(zoomed, anchor)).toEqual(toSourcePixel(base, anchor));
  });

  it("won't zoom out below fit", () => {
    const zoomed = zoomToward({ scale: 0.5, tx: 0, ty: 0 }, { x: 0, y: 0 }, 0.1, 0.5);
    expect(zoomed.scale).toBe(0.5);
  });
});

describe("clampPan", () => {
  const viewport = { width: 100, height: 100 };
  const image = { width: 200, height: 200 };

  it("centres an axis that underflows the viewport", () => {
    // scale 0.25 → scaled 50×50, smaller than viewport → pinned centred at 25.
    const t = clampPan({ scale: 0.25, tx: 999, ty: -999 }, viewport, image);
    expect(t.tx).toBe(25);
    expect(t.ty).toBe(25);
  });

  it("keeps an overflowing image covering the viewport (no empty backdrop)", () => {
    // scale 1 → scaled 200×200. Pan range is [-100, 0]; values outside clamp in.
    expect(clampPan({ scale: 1, tx: 50, ty: 0 }, viewport, image).tx).toBe(0);
    expect(clampPan({ scale: 1, tx: -500, ty: 0 }, viewport, image).tx).toBe(-100);
    expect(clampPan({ scale: 1, tx: -40, ty: 0 }, viewport, image).tx).toBe(-40);
  });

  it("leaves scale untouched", () => {
    expect(clampPan({ scale: 0.7, tx: 0, ty: 0 }, viewport, image).scale).toBe(0.7);
  });
});

describe("wrapIndex", () => {
  it("wraps past the end to the start and before the start to the end", () => {
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(6, 5)).toBe(1);
  });

  it("leaves an in-range index unchanged", () => {
    expect(wrapIndex(3, 5)).toBe(3);
  });

  it("stays safe on an empty set", () => {
    expect(wrapIndex(0, 0)).toBe(0);
    expect(wrapIndex(-1, 0)).toBe(0);
  });
});

describe("toSourcePixel", () => {
  it("inverts the transform: maps a viewport point to its source pixel", () => {
    // image point (10,20) at scale 2, translate (5,5) lands at (25,45).
    const t: Transform = { scale: 2, tx: 5, ty: 5 };
    expect(toSourcePixel(t, { x: 25, y: 45 })).toEqual({ x: 10, y: 20 });
  });
});
