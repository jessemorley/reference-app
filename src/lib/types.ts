// Shared shapes that mirror the Rust structs (see IMPLEMENTATION.md "IPC
// contract"). Slice 1 only uses the root path, but the rest are declared here
// so later slices have a single source of truth.

export type Photographer = {
  name: string;
  /** Path relative to the Photography Root — the pin key (ADR-0002). */
  relPath: string;
  /** Absolute path of the cover Reference image. The tile turns this into a
   *  cached thumbnail on demand via `ensureThumb` (Slice 3); `null` only if the
   *  folder has no readable image (those are skipped before reaching here). */
  coverPath: string | null;
  /** Whether `coverPath` is a user pin (vs. the alphabetical default). Drives
   *  the tile right-click menu's state (Slice 10). */
  pinned: boolean;
};

/** "Uncategorised" is synthetic. */
export type Category = { name: string; count: number };

export type RefImage = {
  name: string;
  /** Absolute path, for full-res asset-protocol load. The grid derives the
   *  cached thumbnail from this on demand via `ensureThumb` / `Thumb.svelte`
   *  (same pattern as a Photographer's cover), so there's no separate thumb
   *  field. */
  path: string;
  /** null = loose (directly in the Photographer folder). */
  category: string | null;
};

/** 256 bins each. */
export type Histogram = {
  r: number[];
  g: number[];
  b: number[];
  l: number[];
};

/** 128×128 Cb/Cr density grid. Row-major: grid[gy * size + gx]. */
export type Vectorscope = {
  size: number;
  grid: number[];
};

/** weight 0..1. */
export type Swatch = {
  hex: string;
  r: number;
  g: number;
  b: number;
  weight: number;
};
