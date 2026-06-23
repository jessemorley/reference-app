import { describe, it, expect } from "vitest";
import { smooth, peak } from "./draw-histogram";

describe("smooth", () => {
  it("leaves a flat distribution unchanged", () => {
    expect(smooth([4, 4, 4, 4, 4])).toEqual([4, 4, 4, 4, 4]);
  });

  it("spreads a lone spike into its neighbours, lowering the peak", () => {
    // kernel [1,2,3,2,1] (weight 9): centre keeps 3/9, neighbours take 2/9.
    const s = smooth([0, 0, 90, 0, 0]);
    expect(s[2]).toBeCloseTo(30); // 90·3/9
    expect(s[1]).toBeCloseTo(20); // 90·2/9
    expect(s[2]).toBeLessThan(90); // no longer a needle
  });

  it("clamps at the ends without reading out of bounds", () => {
    const s = smooth([10, 0, 0]);
    expect(s).toHaveLength(3);
    expect(s.every(Number.isFinite)).toBe(true);
  });
});

describe("peak", () => {
  it("is the shared max across channels, clamped to ≥1", () => {
    expect(peak([[1, 5], [3, 2]])).toBe(5);
    expect(peak([[0, 0]])).toBe(1);
    expect(peak([])).toBe(1);
  });
});
