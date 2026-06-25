import { writable } from "svelte/store";
import type { Photographer } from "../types";

/** The Photographer whose view is open, or null when the root grid is showing.
 *  Setting this navigates into the photographer view; setting it back to null
 *  returns to the grid. */
export const selected = writable<Photographer | null>(null);

/** Synthetic tab keys that are not real Category names. "All" shows every
 *  image; "Uncategorised" shows the loose images (only offered when loose
 *  images and ≥1 real Category coexist — see PhotographerView). */
export const ALL_TAB = "All";
export const UNCATEGORISED_TAB = "Uncategorised";

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
