// Shared shapes that mirror the Rust structs (see IMPLEMENTATION.md "IPC
// contract"). Slice 1 only uses the root path, but the rest are declared here
// so later slices have a single source of truth.

export type Photographer = {
  name: string;
  /** Path relative to the Photography Root — the pin key (ADR-0002). */
  relPath: string;
  /** asset-protocol URL of the cover thumbnail. */
  coverThumb: string | null;
};

/** "Uncategorised" is synthetic. */
export type Category = { name: string; count: number };

export type RefImage = {
  name: string;
  /** Absolute path, for full-res asset-protocol load. */
  path: string;
  /** asset-protocol URL of the cached thumbnail. */
  thumb: string;
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

/** weight 0..1. */
export type Swatch = {
  hex: string;
  r: number;
  g: number;
  b: number;
  weight: number;
};
