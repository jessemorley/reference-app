import { writable, derived, get } from "svelte/store";
import type { Photographer } from "../types";

// Navigation is strictly hierarchical — root → photographer → open image — so
// "back" is just "ascend one level", computable from these two writables. No
// history stack: there's no sideways navigation to retrace.

/** The Photographer whose view is open, or null when the root grid is showing. */
export const selected = writable<Photographer | null>(null);

/** Index into the active tab's shown set of the open image, or null when the
 *  Viewer is closed. A store (not PhotographerView-local) so the header's back
 *  button can see whether the Viewer is open. */
export const openIndex = writable<number | null>(null);

/** Whether there's a level to ascend to (drives the back button). */
export const canBack = derived(
  [selected, openIndex],
  ([$s, $o]) => $s !== null || $o !== null
);

/** Ascend one level: image → grid, else photographer → root. */
export function back() {
  if (get(openIndex) !== null) openIndex.set(null);
  else selected.set(null);
}

/** Synthetic tab keys that are not real Category names. "All" shows every
 *  image; "Uncategorised" shows the loose images (only offered when loose
 *  images and ≥1 real Category coexist — see PhotographerView). */
export const ALL_TAB = "All";
export const UNCATEGORISED_TAB = "Uncategorised";

/** Which root grid is showing: the Photographer grid (default) or the flat
 *  all-images grid with merged Category tabs. A header toggle flips it; only
 *  meaningful while no Photographer is open (`selected === null`).
 *  ponytail: in-memory, resets to "photographers" each launch — persist via
 *  set_setting later if it should survive relaunch. */
export const rootView = writable<"photographers" | "images">("photographers");

/** The root-grid photographer search query. Filtered client-side over the
 *  already-loaded list (no IPC); cleared when the folder changes (Slice 10). */
export const search = writable<string>("");

/** Bumped to ask the active view to silently re-scan in place (⌘R / focus
 *  return — Slice 10). Views ignore the initial 0 and re-fetch without showing
 *  their first-load "Scanning…"/"Loading…" state. */
export const refreshSignal = writable<number>(0);

/** The active filter tab within the photographer view: ALL_TAB,
 *  UNCATEGORISED_TAB, or a Category name. Tracked here (not as local component
 *  state) because the Slice 5 viewer pages through the *active tab's* set, so it
 *  needs to read the same selection. Reset to "All" when the photographer
 *  changes (PhotographerView owns that). */
export const activeTab = writable<string>(ALL_TAB);
