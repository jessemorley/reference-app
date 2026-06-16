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
 *  cover image's absolute path. Turning that into an asset-protocol URL is a
 *  frontend concern, so `listPhotographers` adapts it to `Photographer`. */
type PhotographerRow = {
  name: string;
  relPath: string;
  cover: string | null;
};

/** Photographers directly under `root` that hold at least one image (empty
 *  folders are hidden). Cover is full-res for now — Slice 3 swaps in thumbs. */
export async function listPhotographers(root: string): Promise<Photographer[]> {
  const rows = await invoke<PhotographerRow[]>("list_photographers", { root });
  return rows.map((r) => ({
    name: r.name,
    relPath: r.relPath,
    coverThumb: r.cover ? convertFileSrc(r.cover) : null,
  }));
}
