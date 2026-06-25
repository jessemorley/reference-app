import { writable, derived, get } from "svelte/store";
import type { Photographer } from "../types";

/** One entry in the browser-style navigation history. The three levels are: the
 *  root grid (`photographer: null`), a photographer's view (`photographer` set,
 *  `openIndex: null`), and an open image (`openIndex` set). Back/forward move a
 *  cursor over this stack; any new navigation truncates the forward tail and
 *  pushes. */
type NavState = { photographer: Photographer | null; openIndex: number | null };

const ROOT: NavState = { photographer: null, openIndex: null };

// The history stack and the cursor into it. Kept private; navigation goes
// through the helpers below so the stack can't drift from the live view.
const history = writable<NavState[]>([ROOT]);
const cursor = writable(0);

const current = derived([history, cursor], ([$h, $c]) => $h[$c] ?? ROOT);

/** The Photographer whose view is open, or null when the root grid is showing
 *  (the current history entry's photographer). Read-only — navigate via the
 *  helpers (`openPhotographer`, `back`, …). */
export const selected = derived(current, ($c) => $c.photographer);

/** Index into the active tab's shown set of the open image, or null when the
 *  Viewer is closed (the current history entry's openIndex). */
export const openIndex = derived(current, ($c) => $c.openIndex);

/** Whether there's history to go back / forward to (drives the nav buttons). */
export const canBack = derived(cursor, ($c) => $c > 0);
export const canForward = derived([history, cursor], ([$h, $c]) => $c < $h.length - 1);

/** Append a state, dropping any forward history (a new branch). */
function push(state: NavState) {
  const c = get(cursor);
  history.update((h) => [...h.slice(0, c + 1), state]);
  cursor.set(c + 1);
}

/** Open a photographer's view (from the root grid). */
export function openPhotographer(photographer: Photographer) {
  push({ photographer, openIndex: null });
}

/** Return to the root grid. */
export function goRoot() {
  push(ROOT);
}

/** Open the image at `index` in the current photographer's Viewer. */
export function openImage(index: number) {
  push({ photographer: get(current).photographer, openIndex: index });
}

/** Close the Viewer, back to the current photographer's grid. */
export function closeViewer() {
  push({ photographer: get(current).photographer, openIndex: null });
}

/** Page to another image *within* the open Viewer — replaces the current entry
 *  rather than pushing, so arrowing through images doesn't flood the history. */
export function pageImage(index: number) {
  const c = get(cursor);
  history.update((h) => h.map((s, i) => (i === c ? { ...s, openIndex: index } : s)));
}

/** Step back / forward through the history (no-op at the ends). */
export function back() {
  cursor.update((c) => Math.max(0, c - 1));
}
export function forward() {
  const len = get(history).length;
  cursor.update((c) => Math.min(len - 1, c + 1));
}

/** Reset to a fresh root-only history (on folder change). */
export function resetToRoot() {
  history.set([ROOT]);
  cursor.set(0);
}

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
