import { describe, it, expect } from "vitest";
import { luminance, samplingCanvasSize, toCanvasSample, MAX_CANVAS_AREA } from "./eyedropper";
import type { Transform } from "../viewer/transform";

describe("luminance", () => {
  it("is 0 for black and 255 for white", () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBe(255);
  });

  it("applies Rec. 709 weights to the sRGB bytes (green dominates)", () => {
    expect(luminance(255, 0, 0)).toBe(54); // round(0.2126*255)
    expect(luminance(0, 255, 0)).toBe(182); // round(0.7152*255)
    expect(luminance(0, 0, 255)).toBe(18); // round(0.0722*255)
  });

  it("rounds to an integer", () => {
    expect(Number.isInteger(luminance(17, 99, 200))).toBe(true);
  });
});

describe("samplingCanvasSize", () => {
  it("uses the natural size when it fits within the cap", () => {
    expect(samplingCanvasSize({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("scales down aspect-preserving when the source exceeds the cap", () => {
    // 6000x4000 = 24M px > 16.78M cap.
    const out = samplingCanvasSize({ width: 6000, height: 4000 });
    expect(out.width * out.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    // Aspect ratio (3:2) preserved within rounding.
    expect(out.width / out.height).toBeCloseTo(1.5, 2);
  });

  it("never returns below 1px on degenerate input", () => {
    expect(samplingCanvasSize({ width: 0, height: 0 })).toEqual({ width: 1, height: 1 });
  });
});

describe("toCanvasSample", () => {
  const identity: Transform = { scale: 1, tx: 0, ty: 0 };
  const natural = { width: 100, height: 80 };

  it("maps a viewport point straight through at 1:1 with an uncapped canvas", () => {
    expect(toCanvasSample(identity, { x: 10, y: 20 }, natural, natural)).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("returns null when the point falls outside the image (e.g. over the Backdrop)", () => {
    expect(toCanvasSample(identity, { x: -1, y: 5 }, natural, natural)).toBeNull();
    expect(toCanvasSample(identity, { x: 5, y: 80 }, natural, natural)).toBeNull();
  });

  it("inverts a zoom/pan transform back to the right source pixel", () => {
    // 2x zoom, panned: a source pixel p lands at p*2 + 30. Pixel (10,10) -> (50,50).
    const t: Transform = { scale: 2, tx: 30, ty: 30 };
    expect(toCanvasSample(t, { x: 50, y: 50 }, natural, natural)).toEqual({ x: 10, y: 10 });
  });

  it("scales source coords into a capped (downscaled) canvas", () => {
    // Canvas half the source size: source (40,40) -> canvas (20,20).
    const canvas = { width: 50, height: 40 };
    expect(toCanvasSample(identity, { x: 40, y: 40 }, natural, canvas)).toEqual({
      x: 20,
      y: 20,
    });
  });

  it("clamps the far edge inside the canvas bounds", () => {
    const canvas = { width: 50, height: 40 };
    // Source x just inside (99.x) maps to 49.x -> floors to 49, the last column.
    expect(toCanvasSample(identity, { x: 99, y: 79 }, natural, canvas)).toEqual({
      x: 49,
      y: 39,
    });
  });
});
