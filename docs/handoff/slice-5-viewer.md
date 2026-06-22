# Handoff: Slice 5 — Viewer

## Where things stand
Slices 1–4 are **merged to `main`**. Slice 5 (the Viewer) is **built on branch
`slice-5-viewer`**, all tests green, not yet reviewed/merged.

- Frontend: `npm test` → **41 passing** (18 new `viewer/transform` + the prior
  23). `npm run check` → 0 errors/0 warnings. `npm run build` clean.
- No Rust changes this slice — backdrop persistence reuses the existing
  `get_setting`/`set_setting` commands, and full-res loads go straight through the
  asset protocol (the Root is already in scope via `lib.rs` `allow_root_assets`).
- **Not yet manually verified in the running app** — the GUI can't be driven
  headlessly here. Run `npm run tauri dev` and walk the checklist below.

## What Slice 5 added
Defined in `IMPLEMENTATION.md` §Slices/5; design decisions captured there and in
the new **Viewer** glossary entry in `CONTEXT.md`.

- **`src/lib/viewer/transform.ts`** (pure, fully unit-tested) — the single
  `{ scale, tx, ty }` transform model and its operations: `fitScale`,
  `maxScale`/`clampScale`, `fitTransform`, `zoomToward` (anchor-preserving),
  `clampPan` (keeps the image covering / centred, never flung into empty
  backdrop), `wrapIndex`, and `toSourcePixel` — the inverse the **Slice-7
  eyedropper** will use, shipped now and proven against `zoomToward` so the
  round-trip holds before the eyedropper depends on it.
- **`src/lib/components/Viewer.svelte`** — a **prop-driven overlay** (`images`,
  `index`, `onclose`, `onpage`). It knows nothing about tabs/filtering;
  PhotographerView hands it the active tab's `shown` set. Behaviour:
  - **Overlay scope**: `position: absolute; inset: 0` over the content region
    (below the titlebar + header). A corner **expand toggle** flips it to
    `position: fixed` over the whole window. Expanded state is **ephemeral** —
    every open starts windowed.
  - **Zoom**: ⌘+ / ⌘− (centre-anchored), ⌘0 resets to fit. **Scroll and drag both
    pan** (only when zoomed past fit — scroll is *not* zoom). Min = fit (cap 1.0),
    max = `max(1, 3·fit)`.
  - **Paging**: ←/→ wrap through the set (↑/↓ inert); transform refits per image;
    backdrop + expand persist across paging. **Escape** closes the viewer (or, if
    the backdrop menu is open, closes that first).
  - **Backdrop**: right-click the **surround** → custom dark-glass context menu
    (Black/White/Grey, current check-marked); persists via `setBackdrop`.
    Right-clicking the **image** is suppressed and reserved for Slice-10 image
    actions (pin / reveal).
  - **Full-res lifecycle**: `<img decoding="async">` with a "Loading…" state until
    `onload`, then revealed; `onerror` → "Can't display this image."
- **`PhotographerView.svelte`** — image cells are now `<button>`s that set a local
  `openIndex` (reset when the photographer changes); renders `<Viewer>` when one
  is open. `.view` became the positioning context for the overlay.
- **`ipc.ts`** — `assetUrl(path)` (full-res asset URL, pure `convertFileSrc`),
  `getBackdrop()` / `setBackdrop(token)`.
- **`stores/settings.ts`** — `backdrop` store + `Backdrop` type, `BACKDROP_HEX`
  (grey = `#7f7f7f`), `DEFAULT_BACKDROP` (grey), `asBackdrop` guard. Hydrated in
  `App.svelte` `onMount` alongside tile sizes.

## Gotchas worth knowing
- **HEIC/AVIF now display in the viewer** even though their grid tiles are
  placeholders: the viewer loads the original via `convertFileSrc` and WKWebView
  decodes HEIC/AVIF natively, bypassing the `image` crate (which only gates
  thumbnails). This grid/viewer asymmetry is expected — see the corrected note in
  `slice-4-photographer-view.md`.
- **Verify these can't be eaten by the webview** (couldn't be tested headlessly):
  (1) ⌘+/⌘−/⌘0 actually zoom the image and don't trigger webview page-zoom;
  (2) scroll-pan's `preventDefault` isn't dropped as a passive listener (if it is,
  panning still updates the transform — nothing behind the overlay scrolls).

## Manual verification checklist (Done-when from the plan)
1. Click an image → it opens full-res over the content region; header + traffic
   lights stay visible. Escape closes back to the grid.
2. ⌘+/⌘− zoom (centred), ⌘0 resets to fit; when zoomed, drag and two-finger
   scroll pan and the image never leaves empty backdrop.
3. ←/→ page through the **active tab's** images and wrap at both ends; each lands
   refitted.
4. Right-click the surround → Black/White/Grey menu; the choice fills the
   backdrop and **survives relaunch** (and paging/expand).
5. The expand toggle grows the viewer to the full window and back; reopening a new
   image starts windowed.
6. A HEIC/AVIF whose tile is a placeholder still opens full-res in the viewer.

## How to run
- Dev: `npm run tauri dev` (Rust on PATH via `~/.cargo/env`).
- Frontend: `npm test`, `npm run check`, `npm run build`.

## Workflow note
Same as prior slices: review with `/code-review`, then merge to `main` with
`--no-ff` and delete the branch.

## Next: Slice 6 — Inspector shell
Right-hand glass panel, single toggle (button + shortcut), state remembered;
lays out readout / palette / histogram stubs with compute-on-open wiring. It sits
**beside** the image, which is why the viewer is a content-region overlay rather
than OS-fullscreen. See `IMPLEMENTATION.md` §Slices/6.
