// Typed wrappers over the Tauri commands defined in src-tauri/src/lib.rs.
// Add a wrapper here as each backend command lands in its slice.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Category, Histogram, Photographer, RefImage, Swatch, Vectorscope } from "./types";
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
  pinned: boolean;
  instagram: string | null;
  blurb: string | null;
  website: string | null;
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
    pinned: r.pinned,
    instagram: r.instagram,
    blurb: r.blurb,
    website: r.website,
  }));
}

/** Pin a Photographer's cover to `imgPath`, or pass `null` to clear the pin
 *  (reset to the alphabetical default). Keyed by the folder's relative path
 *  (ADR-0002); the change shows on the next `listPhotographers`. */
export function setCover(relPath: string, imgPath: string | null): Promise<void> {
  return invoke("set_cover", { relPath, imgPath });
}

/** Reveal a file or folder in Finder (selecting it in its parent). */
export function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

/** Open a URL in the default browser (WKWebView blocks external navigation). */
export function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

/** Write photographer bio fields to `.refapp.json` in the photographer's folder.
 *  Pass `null` for either field to clear it. */
export function setPhotographerInfo(
  root: string,
  relPath: string,
  instagram: string | null,
  blurb: string | null,
  website: string | null,
): Promise<void> {
  return invoke("set_photographer_info", { root, relPath, instagram, blurb, website });
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

/** Asset-protocol URL for an original file, for the Viewer's full-res `<img>`.
 *  The Root is already in the asset scope (`lib.rs` `allow_root_assets`), so this
 *  is a pure URL transform with no IPC round-trip; HEIC/AVIF decode in WKWebView
 *  even though their thumbnails can't (the `image` crate gates only thumbs). */
export function assetUrl(path: string): string {
  return convertFileSrc(path);
}

/** 256-bin r/g/b/l histogram for the image at `path`, computed in Rust in one
 *  decode pass (ADR-0001). Rejects on a decode failure — including HEIC/AVIF,
 *  which the `image` crate can't decode even though the viewer/eyedropper handle
 *  them natively; the Inspector renders an "unavailable" state on rejection. */
export function computeHistogram(path: string): Promise<Histogram> {
  return invoke<Histogram>("compute_histogram", { imgPath: path });
}

/** 512×512 Cb/Cr vectorscope density grid for the image at `path`, computed in
 *  Rust in one decode pass (ADR-0001). Rejects on the same decode failures as
 *  `computeHistogram` (HEIC/AVIF & broken files → Inspector "unavailable"). */
export function computeVectorscope(path: string): Promise<Vectorscope> {
  return invoke<Vectorscope>("compute_vectorscope", { imgPath: path });
}

/** Up to `k` dominant colours for the image at `path` (k-means in CIELAB,
 *  Slice 9), sorted by weight desc. `k` is clamped to 3..8 in Rust. Rejects on
 *  the same decode failures as `computeHistogram` (HEIC/AVIF & broken files →
 *  Inspector "unavailable" state). */
export function extractPalette(path: string, k: number): Promise<Swatch[]> {
  return invoke<Swatch[]>("extract_palette", { imgPath: path, k });
}

const BACKDROP_KEY = "prefs.backdrop";

/** The persisted Backdrop token, or null if never set (caller applies its
 *  default). The token — not a hex — is stored so the palette can be retuned
 *  without migrating saved values. */
export function getBackdrop(): Promise<string | null> {
  return invoke<string | null>("get_setting", { key: BACKDROP_KEY });
}

/** Persist the Backdrop token (`"black" | "white" | "grey"`). */
export function setBackdrop(token: string): Promise<void> {
  return invoke("set_setting", { key: BACKDROP_KEY, value: token });
}

const INSPECTOR_OPEN_KEY = "prefs.inspectorOpen";

/** The persisted Inspector open/closed preference, or null if never set (caller
 *  applies its default). Durable and global even though the Inspector only
 *  renders while a Reference image is open. */
export function getInspectorOpen(): Promise<boolean | null> {
  return invoke<boolean | null>("get_setting", { key: INSPECTOR_OPEN_KEY });
}

/** Persist the Inspector open/closed preference. */
export function setInspectorOpen(open: boolean): Promise<void> {
  return invoke("set_setting", { key: INSPECTOR_OPEN_KEY, value: open });
}

const BIO_OPEN_KEY = "prefs.bioOpen";

/** The persisted Bio bar open/closed preference, or null if never set. */
export function getBioOpen(): Promise<boolean | null> {
  return invoke<boolean | null>("get_setting", { key: BIO_OPEN_KEY });
}

/** Persist the Bio bar open/closed preference. */
export function setBioOpen(open: boolean): Promise<void> {
  return invoke("set_setting", { key: BIO_OPEN_KEY, value: open });
}

const PALETTE_K_KEY = "prefs.paletteK";

/** The persisted palette colour-count (Slice 9), or null if never set (caller
 *  applies its default). */
export function getPaletteK(): Promise<number | null> {
  return invoke<number | null>("get_setting", { key: PALETTE_K_KEY });
}

/** Persist the palette colour-count. */
export function setPaletteK(k: number): Promise<void> {
  return invoke("set_setting", { key: PALETTE_K_KEY, value: k });
}
