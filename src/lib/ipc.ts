// Typed wrappers over the Tauri commands defined in src-tauri/src/lib.rs.
// Add a wrapper here as each backend command lands in its slice.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Photographer } from "./types";

/** Open the folder picker; persists and returns the chosen Photography Root,
 *  or null if the user cancels. */
export function selectRoot(): Promise<string | null> {
  return invoke<string | null>("select_root");
}

/** The persisted Photography Root, or null on first run. */
export function getRoot(): Promise<string | null> {
  return invoke<string | null>("get_root");
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

/** Ensure a cached thumbnail exists for the image at `path` (generating it on
 *  first request), returning its asset-protocol URL ready for an `<img>` src. */
export async function ensureThumb(path: string): Promise<string> {
  const thumbPath = await invoke<string>("ensure_thumb", { imgPath: path });
  return convertFileSrc(thumbPath);
}
