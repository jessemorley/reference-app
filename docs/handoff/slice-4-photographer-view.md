# Handoff: Slice 4 — Photographer view

## Where things stand
Slices 1–3 are **merged to `main`**. Slice 4 (photographer view) is **built on
branch `slice-4-photographer-view`**, all tests green, not yet reviewed/merged.

- Rust: `cargo test` → 24 passing (17 `scan`+`thumbs` from before, +7 new
  `scan_images` tests). `cargo check` clean.
- Frontend: `npm test` → 20 passing. `npm run check` → 0 errors. `npm run build` clean.
- **Not yet manually verified in the running app** — GUI can't be driven
  headlessly here. The user should `npm run tauri dev`, pick a folder, click a
  photographer, and confirm the image grid + Category tabs (see checklist below).

## What Slice 4 added
Defined in `IMPLEMENTATION.md` §Slices/4.

- **`src-tauri/src/scan.rs`** — `list_images` joins it to the existing scanner:
  - `scan_images(dir)` walks a Photographer folder **one level deep**. Loose
    images (directly in `dir`) get `category: None`; an immediate subfolder with
    ≥1 image becomes a `Category` and its immediate images take its name.
    Categories **do not nest** (CONTEXT.md) — images deeper than one level inside
    a Category are ignored. Image-less subfolders are not Categories.
  - Returns `PhotographerImages { categories, images }`. Categories sorted by
    name (case-insensitive). Images sorted by **(category, name)** with loose
    first (`None` < `Some`), so the flat "All" grid has a stable order and
    per-tab filtering just narrows it. Hidden entries / AppleDouble sidecars
    skipped, same rules as `find_cover`.
  - Command is `list_images(root, rel_path)` — frontend passes Root + the
    Photographer's `relPath` and Rust joins them, so the frontend never builds
    absolute paths. Runs on the blocking pool (same rationale as
    `list_photographers`). Logic in the free fn, command is thin glue.
- **`lib.rs`** — registers `scan::list_images`.
- **Frontend**
  - `ipc.ts`: `listImages(root, relPath)` returns the camelCase payload as-is.
  - `types.ts`: **dropped the unused `thumb` field from `RefImage`** — the grid
    derives the thumb from `path` via `Thumb.svelte`, exactly like a cover
    (Slice 3's precedent). IPC contract in `IMPLEMENTATION.md` updated to match.
  - New **`stores/navigation.ts`**: `selected` (the open Photographer, or null =
    root grid) and `activeTab` (`ALL_TAB` / `UNCATEGORISED_TAB` / a Category
    name). `activeTab` lives in a store because the **Slice 5 viewer** will page
    through the *active tab's* set and needs to read the same selection.
  - New **`PhotographerView.svelte`**: loads via `listImages`, synthesises the
    tab bar — **"All" first, then Categories, then "Uncategorised"**, the last
    only when loose images AND ≥1 real Category coexist; **no tab bar when
    everything is loose**. Tabs filter the flattened grid; resets to "All" when
    the photographer changes. Reuses `Thumb.svelte` per cell (square tiles).
    Image clicks are intentionally inert — the viewer is Slice 5.
  - **`PhotographerGrid.svelte`**: tiles are now `<button>`s (keyboard-reachable)
    that call a new `onselect(photographer)` prop. Cover stays `alt=""`
    (decorative) so the visible name is the button's accessible label.
  - **`App.svelte`**: switches between `PhotographerGrid` (with
    `onselect={(p) => selected.set(p)}`) and `PhotographerView` on `$selected`;
    header shows a "‹ Photographers" back button + the photographer name when
    inside a view. "Change folder…" clears `selected` before re-scanning.

### Gotcha worth knowing
The HEIC/AVIF limitation from Slice 3 still applies: such images **list** in the
grid but show the `Thumb` placeholder (the `image` crate can't decode them).
Same will bite the Slice 5 viewer (full-res).

## Manual verification checklist (Done-when from the plan)
1. Pick a folder → grid. Click a photographer → its images appear in a flattened
   grid; the back button returns to the grid.
2. A photographer with loose images **and** subfolders shows tabs:
   All / <Categories…> / Uncategorised. Clicking a tab filters the grid.
3. A photographer whose images are **all loose** shows **no tab bar**.
4. A photographer with **only** Category subfolders (no loose) shows tabs but
   **no Uncategorised**.

## How to run
- Dev: `npm run tauri dev` (Rust on PATH via `~/.cargo/env`).
- Frontend: `npm test`, `npm run check`, `npm run build`.
- Rust only: `cd src-tauri && cargo test` / `cargo check`.

## Workflow note
Same as prior slices: review with `/code-review`, then merge to `main` with
`--no-ff` and delete the branch.

## Next: Slice 5 — Viewer
Click an image → full-screen viewer, full-res via asset protocol; backdrop
selector (persisted); scroll-zoom + drag-pan; arrow keys page within the
**active tab's** set (read `activeTab` + the photographer's images), wrapping;
Escape closes. See `IMPLEMENTATION.md` §Slices/5.
