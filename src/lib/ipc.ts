// Typed wrappers over the Tauri commands defined in src-tauri/src/lib.rs.
// Add a wrapper here as each backend command lands in its slice.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Category, Photographer, RefImage } from "./types";
import type { TileView } from "./stores/settings";

/** Open the folder picker; persists and returns the chosen Photography Root,
 *  or null if the user cancels. */
export function selectRoot(): Promise<string | null> {
  return invoke<string | null>("select_root");
}

/** The persisted Photography Root, or null on first run. */
export function getRoot(): Promise<string | null> {
  return invoke<string | null>("get_root");
}

// View preferences persist through the Rust setting commands (not the JS store
// plugin) so settings.json keeps a single writer. These typed wrappers hide the
// raw store keys; callers deal in views and pixels.
const TILE_SIZE_KEY: Record<TileView, string> = {
  root: "prefs.rootTileSize",
  photographer: "prefs.photographerTileSize",
};

/** Persisted tile sizes per view, with `null` for any not yet set (caller
 *  applies its default). */
export async function getTileSizes(): Promise<Record<TileView, number | null>> {
  const [root, photographer] = await Promise.all([
    invoke<number | null>("get_setting", { key: TILE_SIZE_KEY.root }),
    invoke<number | null>("get_setting", { key: TILE_SIZE_KEY.photographer }),
  ]);
  return { root, photographer };
}

/** Persist a view's tile size (the grid column min-width, in px). */
export function setTileSize(view: TileView, px: number): Promise<void> {
  return invoke("set_setting", { key: TILE_SIZE_KEY[view], value: px });
}

/** A row from the Rust `list_photographers` command, where `cover` is the
 *  cover image's absolute path. The TS `Photographer` calls it `coverPath`; the
 *  tile thumbnails it on demand via `ensureThumb`. */
type PhotographerRow = {
  name: string;
  relPath: string;
  cover: string | null;
};

/** Photographers directly under `root` that hold at least one image (empty
 *  folders are hidden). Each carries the cover's absolute path; the grid
 *  requests cached thumbnails per tile so covers fill in progressively. */
export async function listPhotographers(root: string): Promise<Photographer[]> {
  const rows = await invoke<PhotographerRow[]>("list_photographers", { root });
  return rows.map((r) => ({
    name: r.name,
    relPath: r.relPath,
    coverPath: r.cover,
  }));
}

/** One Photographer's Reference images, flattened, plus the real Category tabs.
 *  The shape matches the Rust `PhotographerImages` (already camelCase), so it's
 *  returned as-is. `rel_path` is joined onto the Root in Rust. */
export function listImages(
  root: string,
  relPath: string
): Promise<{ categories: Category[]; images: RefImage[] }> {
  return invoke("list_images", { root, relPath });
}

/** Ensure a cached thumbnail exists for the image at `path` (generating it on
 *  first request), returning its asset-protocol URL ready for an `<img>` src. */
export async function ensureThumb(path: string): Promise<string> {
  const thumbPath = await invoke<string>("ensure_thumb", { imgPath: path });
  return convertFileSrc(thumbPath);
}
