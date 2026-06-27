# Simplify navigation: back-only (drop the forward/history stack)

## Goal
The user wants **only a back button** in the header. Forward is not wanted.
Replace the full browser-style history stack (added in commit `8cf26e6`) with a
minimal "ascend one level" back action. This was proposed and approved in
conversation but **not yet built**.

## Branch / context
- Branch: `slice-10-polish` (6 commits on top of `main`).
- The stack was added in the last commit `8cf26e6` ("Add browser-style
  back/forward navigation across all three levels"). This task largely reverses
  that commit's *approach* while keeping a back button.

## Why simpler works
Navigation is strictly hierarchical: root → photographer → open image. From an
image you can only go up to its grid; from a photographer only up to root. So
"back" is just **ascend one level**, computable from current state — no history
array/cursor needed. A back-only stack and "ascend one level" are behaviorally
identical here (no sideways navigation), so nothing real is lost.

## Target implementation
`src/lib/stores/navigation.ts` — revert to two plain writables + a 12-line back:
```ts
export const selected = writable<Photographer | null>(null);
export const openIndex = writable<number | null>(null); // store, not local,
  // so the header back button can see whether the Viewer is open
export const canBack = derived([selected, openIndex],
  ([s, o]) => s !== null || o !== null);
export function back() {
  if (get(openIndex) !== null) openIndex.set(null); // image → grid
  else selected.set(null);                          // photographer → root
}
```
Delete from `navigation.ts`: the history array, cursor, `current`, `push`,
`forward`, `canForward`, `pageImage`, `closeViewer`, `goRoot`, `resetToRoot`.

`src/lib/components/PhotographerView.svelte`:
- `openImage(i)` → `openIndex.set(i)`; paging (`onpage`) → `openIndex.set(i)`;
  close (`onclose`) → `openIndex.set(null)`.
- Restore `openIndex.set(null)` reset in the load `$effect` (on photographer
  change) — the stack used to handle this implicitly.
- Vanish-fallback (empty rescan) `goRoot()` → `selected.set(null)`.

`src/App.svelte`:
- One `ArrowLeft` button only (drop the `ArrowRight` import + button),
  `disabled={!$canBack}`, `onclick={back}`.
- Grid `onselect` → `selected.set(p)`.
- `change()` folder-change reset → `selected.set(null); openIndex.set(null)`
  (was `resetToRoot()`).

`src/App.test.ts`:
- `beforeEach` currently calls `resetToRoot()` → replace with
  `selected.set(null); openIndex.set(null)` (import both).
- Keep the two assertions already fixed for the search-bar/title change — do NOT
  reintroduce the old root-path-as-text assertions.

`src/lib/stores/navigation.test.ts`:
- Shrink to a few ascend cases: image→grid→root, `canBack` at each level,
  folder reset. Delete the forward / truncation / page-replace cases.

## Watch out for
- `openIndex` must stay a store (not PhotographerView-local) so App's header can
  read it for `back()` / `canBack`. This is the one piece that differs from the
  pre-`8cf26e6` original (which had `openIndex` local).
- The back button is in App's header; the Viewer renders *below* the header
  (inside PhotographerView's `.view`), so the button stays clickable while the
  Viewer is open — except in the Viewer's **expanded** (fill-window) mode, which
  covers the header. That's acceptable (Escape/shrink still work) and matches
  every other header control.
- Keep routing all navigation mutations through `selected`/`openIndex` setters;
  don't reintroduce stale local state.

## Verify
- `npm run check`, `npm test` (currently 64 pass — expect fewer after trimming
  navigation tests), `npm run build`.
- `cargo test` in `src-tauri/` is unaffected (no Rust change).

## Suggested skills
- `ponytail:ponytail` — this is explicitly a simplification/deletion task; keep
  it minimal.
- `verify` or `run` — optionally launch the Tauri app to confirm the back
  button ascends correctly through the three levels.

## Then
Commit to `slice-10-polish` (the user has been committing each step there with a
descriptive message; ask/confirm as they've done each time).
