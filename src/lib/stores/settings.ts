import { writable } from "svelte/store";

/** Which grid a tile-size value belongs to. The root grid (Photographer tiles)
 *  and the photographer view (Reference image tiles) each remember their own
 *  size — they're different browsing tasks with different ideal densities. */
export type TileView = "root" | "photographer";

/** Tile-size slider bounds, in px of the grid column's min-width. The ceiling
 *  stays near the crisp range of the 600px-capped thumbnails (THUMB_MAX): past
 *  this, tiles outgrow their rendition and soften, and full-res fidelity is the
 *  viewer's job, not the grid's. */
export const TILE_MIN_PX = 120;
export const TILE_MAX_PX = 320;
export const TILE_STEP_PX = 10;

/** Defaults match the values the grids shipped with, so behaviour is unchanged
 *  until the slider is touched. */
export const DEFAULT_TILE_SIZE: Record<TileView, number> = {
  root: 200,
  photographer: 160,
};

/** Persisted view preferences. The grids read their tile size from here (via a
 *  `--tile-min` custom property) and the header sliders write it; hydrated from
 *  the backend store on startup (see App.svelte). */
export const settings = writable<Record<TileView, number>>({
  ...DEFAULT_TILE_SIZE,
});

/** Backdrop: the neutral surround behind the image in the Viewer, so colour can
 *  be judged against a controlled fill (see CONTEXT.md). Three fixed tokens; the
 *  greys are true neutrals. Default grey — the least biased surround (black
 *  crushes shadow perception, white blows highlights). */
export type Backdrop = "black" | "white" | "grey";

export const DEFAULT_BACKDROP: Backdrop = "grey";

/** Canonical fills for each token. 50% grey is the photographer's neutral
 *  reference; stored as a token (not this hex) so it can be retuned later. */
export const BACKDROP_HEX: Record<Backdrop, string> = {
  black: "#000000",
  white: "#ffffff",
  grey: "#7f7f7f",
};

/** The active Backdrop, hydrated from the backend store on startup (App.svelte);
 *  the Viewer reads it, its right-click menu writes it. Global — one surround
 *  everywhere, not per-photographer or per-image. */
export const backdrop = writable<Backdrop>(DEFAULT_BACKDROP);

/** Narrow an arbitrary persisted value to a known token, falling back to the
 *  default — guards against a hand-edited or stale store value. */
export function asBackdrop(value: unknown): Backdrop {
  return value === "black" || value === "white" || value === "grey"
    ? value
    : DEFAULT_BACKDROP;
}

/** Whether the Inspector (the analysis panel beside the Viewer — see CONTEXT.md)
 *  is shown. Viewer-bound: the panel only renders while an image is open, but the
 *  preference itself is durable and global, so it survives closing the Viewer and
 *  relaunching. Default closed — viewing is the primary task; analysis is opt-in.
 *  Hydrated from the backend store on startup (App.svelte). */
export const DEFAULT_INSPECTOR_OPEN = false;

export const inspectorOpen = writable<boolean>(DEFAULT_INSPECTOR_OPEN);

/** Coerce an arbitrary persisted value to a boolean, defaulting when it's null
 *  or hand-edited to something else. */
export function asInspectorOpen(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_INSPECTOR_OPEN;
}

/** Number of colours the palette extractor returns (Slice 9). Global + durable
 *  so the choice survives paging, remounting the Inspector, and relaunch — the
 *  Inspector remounts per open/page, so a component-local value would reset to
 *  the default each time. Range matches the `extract_palette` clamp; default 5.
 *  Hydrated from the backend store on startup (App.svelte). */
export const PALETTE_K_MIN = 3;
export const PALETTE_K_MAX = 8;
export const DEFAULT_PALETTE_K = 5;

export const paletteK = writable<number>(DEFAULT_PALETTE_K);

/** Clamp/round an arbitrary persisted value into the valid k range, defaulting
 *  when it's null or hand-edited to junk. */
export function asPaletteK(value: unknown): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  return Number.isFinite(n)
    ? Math.min(PALETTE_K_MAX, Math.max(PALETTE_K_MIN, n))
    : DEFAULT_PALETTE_K;
}

export const GRID_GAP_MIN = 0;
export const GRID_GAP_MAX = 8;
export const GRID_GAP_STEP = 1;
export const DEFAULT_GRID_GAP = 1;

export const gridGap = writable<number>(DEFAULT_GRID_GAP);

export function asGridGap(value: unknown): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  return Number.isFinite(n)
    ? Math.min(GRID_GAP_MAX, Math.max(GRID_GAP_MIN, n))
    : DEFAULT_GRID_GAP;
}
