# Handoff: Slice 10 — Polish

## Where things stand
Branch: `slice-10-polish` — **not yet merged**. Ready for merge to `main`.

- Frontend: `npm test` → **62 passing** (9 test files), `npm run check` → 0 errors.
- Backend: `cargo test` → passes (no Rust unit tests in this slice; logic is in
  integration with Tauri).
- Slice commits (in order on the branch):
  - `ccf358d` Slice 10: polish — cover pinning, search, reveal in Finder, refresh
  - `7d66c59` Suppress native context menu and disable text selection app-wide
  - `b1583c6` Replace root-header folder path with a full-width search bar
  - `6516cd4` Match header button height and text size to the search bar
  - `f8d1054` Add lucide icon to the Change folder button
  - `8cf26e6` Add browser-style back/forward navigation across all three levels
  - `b1d5c38` Simplify nav to back-only ascend; add home button
  - `e3372ac` Add search icon inside the search bar
  - `32a6ca8` Make Change folder button icon-only; move slider to far right
  - `7552a81` Replace tile-size slider glyphs with zoom-out/zoom-in icons
  - `b8dfe0b` Round root grid tile corners
  - `4859a75` Add hover zoom + fading dim overlay to grid tiles
  - `de07390` Style photographer name like search bar with user icon
  - `c7bc3dd` Drop hover zoom from photographer image grid; keep dim fade
  - `7691076` Swap folder icons: Folder for change-folder, FolderOpen for reveal
  - `e74afda` Hide tile-size slider in single-image view
  - `fab1ec8` Surface Back/Home over the expanded Viewer
  - `8944a62` Add drag region for windowed header and expanded-Viewer mode
  - `e2eb0cf` Fix openIndex state bugs and silent-failure edge cases from code review

## What Slice 10 added

### Cover pinning
`set_cover(relPath, imgPath | null)` writes a `covers` map into `settings.json`.
`list_photographers` (now `async`, takes `AppHandle`) reads that map and resolves
the cover: pinned image wins if the file is still on disk, else falls back to the
alphabetical default from `scan_photographers`. No separate `get_cover` — the grid
is the only consumer and it gets it from `list_photographers`.

The pin state is exposed via a **right-click context menu on photographer-view image
tiles** with three states (see §Key decisions). The local `coverPath`/`pinned` state
in `PhotographerView` updates optimistically on pin/reset without waiting for a rescan
— the grid reflects the change on the next `listPhotographers`.

New in `src-tauri/src/scan.rs`: `Photographer.pinned` bool field; `read_cover_pins`
helper. New in `src-tauri/src/lib.rs`: `set_cover` command; `COVERS_KEY` const.

### Photographer search
Always-visible `<input type="search">` in the root header. Client-side,
case-insensitive substring match on `photographer.name` over the already-loaded list
— no IPC. `search` writable store in `navigation.ts`; cleared in `change()` when the
folder changes. "No photographers match…" empty state.

### Reveal in Finder
`reveal_in_finder(path)` via `tauri-plugin-opener`. Two surfaces:

- **Photographer-view header** — `FolderOpen` icon button reveals the photographer's
  folder (`root + "/" + relPath`).
- **Image-tile right-click menu** (shared with the cover menu) — reveals the image
  file.

`reveal_in_finder` returns `Result<(), String>` so Tauri propagates errors; both
frontend call sites suppress the rejection with `.catch(() => {})` (the Finder open
is best-effort — no error UI).

### Refresh
`refreshSignal` writable store in `navigation.ts` (starts at 0, bumped as an
integer). Two triggers:

- **⌘R** — `onKeydown` in `App.svelte` bumps the signal and calls
  `e.preventDefault()` to block the webview's native reload.
- **Focus return > 5s** — `onFocus` in `App.svelte` checks `Date.now() - blurAt`.
  `blurAt` is only cleared when a refresh fires (not on every focus), so cumulative
  away-time across short absences also triggers.

Both `PhotographerGrid` and `PhotographerView` have a `$effect` that watches the
signal and re-fetches silently (no loading flash, scroll preserved). An empty
`list_images` result (folder deleted) falls back to the root grid; `openIndex` is
cleared first so `canBack` is clean.

### Header + navigation polish
The header was significantly reworked this slice:

- Root view: folder path label → full-width search input (search icon inset left).
  "Change folder" → icon-only `Folder` button.
- Photographer view: "‹ Photographers" text button → photographer name styled like
  the search bar (User icon inset left, same border/background). `FolderOpen` button
  for reveal. Tile-size slider hidden while the Viewer is open.
- **Back / Home buttons** added leftmost in the header at all levels. Back ascends
  one level (image → grid, grid → root). Home jumps straight to root. Both disabled
  at root.
- Navigation store simplified from a history stack to two writables + `canBack` +
  `back()`. `openIndex` is now a store (not PhotographerView-local) so the header
  can read it.
- **Viewer expanded mode**: Back/Home appear top-left (offset 88px to clear traffic
  lights) since the header is covered. A transparent `drag-strip` across the top
  keeps window-drag working in expanded mode.
- `data-tauri-drag-region` added to the header bar and the expanded viewer's drag
  strip. Requires the `core:window:allow-start-dragging` permission (already in
  capabilities).

Other visual polish: rounded root-grid tile corners, hover zoom + dim-fade overlay on
root tiles (respects `prefers-reduced-motion`), dim-fade (no zoom) on photographer-
view tiles, Lucide `ZoomOut`/`ZoomIn` icons flanking the tile-size slider,
app-wide `-webkit-user-select: none` (inputs opt back in), global context-menu
suppressor in `main.ts`.

## Key decisions

**Cover-menu three states** (`coverItem` in `PhotographerView`):
| Tile | `pinned` | Label | Enabled |
|------|----------|-------|---------|
| currently-pinned cover | true | "Reset to default cover" | ✓ |
| un-pinned alphabetical default | false | "Current cover" | ✗ |
| any other tile | — | "Set as cover" | ✓ |

After a reset, `coverPath` goes `null` locally — the menu shows "Set as cover" on
every tile until the next grid rescan, which resolves the real alphabetical default.
No cover badge anywhere; state lives only in the menu.

**`openIndex` must be a store** (not PhotographerView-local) so `back()` and
`canBack` in the navigation store can see whether the Viewer is open. This is the
one structural change relative to pre-Slice-10 state.

**Navigation is strictly hierarchical** (root → photographer → image), so "back" is
just "ascend one level" — no history array needed. A forward-history stack was
briefly added (`8cf26e6`) then simplified away (`b1d5c38`).

**Traffic-light offset** (`left: 88px` in `.controls-left`): hardcoded against the
`trafficLightPosition: {x:15, y:26}` in `tauri.conf.json`. If the traffic-light
position ever changes, update this value too.

## Gotchas worth knowing
- **Stale cover state after reset**: after `set_cover(relPath, null)` the component
  doesn't know the new alphabetical default (only `list_photographers` knows). All
  tiles show "Set as cover" until the next root-grid rescan. Acceptable — no badge,
  the state is menu-only.
- **`blurAt` semantics**: the away timer is cumulative from the last refresh, not
  continuous from the last blur. Multiple short tab-aways that add up to > 5s will
  eventually trigger a refresh. The comment says "> 5s absence" which is met, just
  not necessarily in one stretch.
- **`set_cover` errors are silent**: `chooseCover` calls `void setCover(...)` —
  if the store write fails the local state updates but the disk doesn't. Optimistic
  update pattern; no error UI.
- **Refresh effect `$refreshSignal === 0` guard**: both grid effects skip the initial
  `0` to avoid a duplicate fetch on mount. If the signal is ever reset to `0` outside
  of a folder change (it isn't today), those views would silently drop the next bump.
- **`home()` is not extracted to navigation.ts**: `selected.set(null); openIndex.set(null)`
  is inlined in both `App.svelte`'s Home button and `Viewer.svelte`'s `home()`. A
  transient state where `canBack` is true with `selected=null` exists between the two
  `.set()` calls, but is harmless (root grid isn't mounted until `selected` is null).

## Manual verification checklist
1. **Cover pin** — right-click an image tile → "Set as cover"; grid tile updates on
   next ⌘R or relaunch. Right-click the pinned tile → "Reset to default cover".
   Right-click the unset alphabetical-default tile → "Current cover" (greyed out).
2. **Cover survives relaunch** — pin a cover, quit and reopen → grid shows it.
3. **Search** — type in the search bar → grid filters live (case-insensitive).
   Clear → all photographers return. Change folder → search clears.
4. **Reveal in Finder** — photographer-view header FolderOpen button → Finder opens
   on the photographer folder. Image-tile right-click → "Reveal in Finder" → Finder
   opens on the image file.
5. **⌘R** — while in a photographer view, edit/add a file on disk, ⌘R → grid
   updates without navigating away or flashing.
6. **Focus-return refresh** — switch away for > 5s, return → silent rescan.
7. **Back/Home** — from image: Back → photographer grid. From grid: Back → root.
   Home from image → root in one step. Both disabled at root.
8. **Expanded viewer** — Back/Home visible top-left; window draggable by the top strip.
9. **Tile-size slider hidden** while Viewer is open in photographer view.

## How to run
- Dev: `npm run tauri dev`. **Rust changes need a dev-server restart.**
- Frontend only: `npm test`, `npm run check`, `npm run build`.
- Backend: `cargo test` in `src-tauri/`.

## Workflow note
Same as prior slices: review with `/code-review`; merge to `main` with `--no-ff`,
delete the branch. This slice is **not yet merged**.

## Next: Slice 11 — Photographer info
`IMPLEMENTATION.md` §Slices/11: per-photographer metadata (Instagram link + short
blurb), stored in a hidden `.refapp` file in the photographer's folder. Or continue
with **Slices 12/13** (Vectorscope/Waveform) — the direct analysis siblings of
Slices 8/9, reusing the Rust-batch-decode + Inspector compute-seam pattern.
