import { describe, it, expect } from "vitest";
import { densityToBrightness, cellColor } from "./draw-vectorscope";

describe("densityToBrightness", () => {
  it("returns 0 for zero count", () => {
    expect(densityToBrightness(0, 100)).toBe(0);
  });

  it("returns 1 when count equals maxCount", () => {
    expect(densityToBrightness(50, 50)).toBe(1);
  });

  it("returns 0 when maxCount is 0", () => {
    expect(densityToBrightness(0, 0)).toBe(0);
  });

  it("lower density is dimmer (log scale)", () => {
    const bright5 = densityToBrightness(5, 1000);
    const bright50 = densityToBrightness(50, 1000);
    expect(bright50).toBeGreaterThan(bright5);
  });

  it("compresses dynamic range: 10× more density is well under 10× brighter", () => {
    const b1 = densityToBrightness(10, 1000);
    const b10 = densityToBrightness(100, 1000);
    expect(b10 / b1).toBeLessThan(3); // log1p(100)/log1p(10) ≈ 2.0
  });
});

describe("cellColor", () => {
  it("centre cell is near-grey (equal Cb/Cr ≈ 0 → Y=0.5 → R≈G≈B≈128)", () => {
    // gx=63, gy=63 → cb≈-0.004, cr≈-0.004 → very close to neutral
    const [r, g, b] = cellColor(63, 63, 128);
    expect(Math.abs(r - 128)).toBeLessThan(5);
    expect(Math.abs(g - 128)).toBeLessThan(5);
    expect(Math.abs(b - 128)).toBeLessThan(5);
  });

  it("high-Cr cell is reddish (R > B)", () => {
    // gy=120 → cr=(120.5/128)-0.5≈0.44 → positive Cr → reddish at Y=0.5
    const [r, , b] = cellColor(64, 120, 128);
    expect(r).toBeGreaterThan(b);
  });

  it("high-Cb cell is bluish (B > R)", () => {
    // gx=120 → cb≈0.44 → positive Cb → bluish at Y=0.5
    const [r, , b] = cellColor(120, 64, 128);
    expect(b).toBeGreaterThan(r);
  });

  it("output channels are integers in 0..255", () => {
    for (const [gx, gy] of [[0, 0], [64, 64], [100, 50], [127, 127]]) {
      const [r, g, b] = cellColor(gx, gy, 128);
      for (const v of [r, g, b]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});
