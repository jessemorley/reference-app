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
