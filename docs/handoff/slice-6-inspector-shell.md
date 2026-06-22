# Handoff: Slice 6 — Inspector shell

## Where things stand
Slices 1–5 are **merged to `main`**. Slice 6 (the Inspector shell) is **built on
branch `slice-6-inspector-shell`**, reviewed with `/code-review` and the findings
applied, all tests green — **not yet merged**.

- Frontend: `npm test` → **41 passing** (unchanged from Slice 5 — the shell is UI
  + inert stubs, so no new unit tests; real tests land with the compute in 7–9).
  `npm run check` → 0 errors / 0 warnings.
- **No Rust changes this slice** — the Inspector preference reuses the existing
  `get_setting` / `set_setting` commands. A JS boolean round-trips through
  `serde_json::Value` cleanly, so the backend needed no new code.
- Branch commits:
  - `26a89b0` Slice 6: Inspector shell
  - `d0b9338` Inspector: opaque chrome fill instead of glass
  - `3e8da02` Slice 6: address review findings
  - `b6cead1` Fix ISSUES #1 + #3 (backdrop menu over Inspector; menubar selection)
  - `4b60346` Fix ISSUES #2 (grid bleeding through the header/viewer seam)
- The shell itself wasn't driveable headlessly here, but the three `ISSUES.md`
  fixes above **were verified in the running app** this session. The core
  done-when (toggle + remembers across launch) still wants a manual pass — see
  the checklist below.

## What Slice 6 added
Defined in `IMPLEMENTATION.md` §Slices/6; design decisions captured there and in
the new **Inspector** glossary entry in `CONTEXT.md`.

- **`src/lib/components/Inspector.svelte`** (new) — the analysis panel beside the
  Viewer. **Viewer-bound**: it renders only while a Reference image is open *and*
  the global `inspectorOpen` preference is on, so **mounting *is* "opened for this
  image"** and unmounting is "closed". Lays out three stub regions top-to-bottom —
  **readout → histogram → palette** (the two eyedropper-coupled tools adjacent).
  Holds the **compute-on-open seam**: an `$effect` that calls `recompute(image,
  signal)` on mount and on every page to a new image, with a `signal.cancelled`
  cleanup flag so a slow result never lands on the wrong image (the same
  cancellation pattern `PhotographerView` uses for `list_images`). `recompute` is
  a **no-op stub** today; Slices 8 (`compute_histogram`) and 9 (`extract_palette`)
  fill it in. Slice 7's eyedropper is local canvas work and does **not** go
  through here.
- **`src/lib/components/Viewer.svelte`** — restructured from a single box into an
  outer **`.viewer` flex row** = **`.surround`** (the image column, `flex: 1`,
  carries the backdrop fill, the `vw`/`vh` binding, and all pointer/scroll/
  right-click handlers) + the **Inspector column** when open. Insetting the
  surround (rather than floating the panel over the image) keeps the whole image
  hoverable for the Slice-7 eyedropper and lets the fit math track the shrunk
  `vw` for free. Adds **⌘I** (matches macOS Preview's Show Inspector) and a
  control-cluster **toggle button** (`◨`). The toggle persists on every flip via
  `setInspectorOpen`, exactly like the Backdrop.
- **`src/lib/stores/settings.ts`** — `inspectorOpen` writable + `DEFAULT_INSPECTOR_OPEN`
  (`false` — viewing is the primary task, analysis is opt-in) + `asInspectorOpen`
  coercion guard. Hydrated in `App.svelte` `onMount` alongside tile sizes / backdrop.
- **`src/lib/ipc.ts`** — `getInspectorOpen()` / `setInspectorOpen(open)` over the
  `prefs.inspectorOpen` key.
- **`src/App.svelte`** — `getInspectorOpen()` folded into the startup `Promise.all`,
  then `inspectorOpen.set(asInspectorOpen(...))`.

## Review + issue fixes applied this session
- **Inspector visibility is gated on `canInspect = !!image && !failed`** — the
  toggle button, ⌘I, and the panel all share that one predicate, so the global
  pref can't be flipped/persisted with no panel to show (the empty-set race), and
  the Slice 8-9 compute seam will never fire on undecodable pixels (a failed image).
- **⌘I guards `!altKey && !ctrlKey`** so `⌘⌥I` / `⌘⌃I` chords don't toggle (and
  persist a write).
- **Dialog focusability restored** — `tabindex="-1"` sits on the `role="dialog"`
  `.viewer` again (the restructure had stranded it on the role-less `.surround`).
- **Inspector `$effect` simplified** — dropped a redundant `image.path` track line
  (`recompute(image, …)` already reads the derived); the cancellation seam stays
  (documented design).
- **ISSUES #1 — backdrop ("BG Colour") menu** now lives at the **`.viewer` level**
  (not inside the `overflow:hidden` `.surround`), positioned against the viewer
  box and clamped, so it renders **over** the Inspector instead of being clipped
  at its edge.
- **ISSUES #3 — menubar** `.bar` got `user-select: none` (+ `-webkit-` for the
  WKWebView) so chrome labels aren't drag-selectable.
- **ISSUES #2 — grid seam** — `PhotographerView` hides the grid + tabs behind the
  open Viewer with `visibility: hidden` (kept in layout so scroll position
  survives), so no thumbnail row bleeds through the sub-pixel header/content seam.

Left as-is on purpose: the `getInspectorOpen(): Promise<boolean | null>` type
slightly over-claims (the store returns a raw `serde_json::Value`), but it's
coerced by `asInspectorOpen` and matches the existing `getBackdrop` convention;
the `recompute` no-op seam is kept per `IMPLEMENTATION.md`.

## Gotchas worth knowing
- **The Inspector fill is opaque `#1e1e1e`, not glass** (commit `d0b9338`). The
  panel sits over the content region, not the bare window, so a transparent /
  glass fill would let the photographer grid bleed through. The hex is sampled
  from `screenshots/bar-colours.png` to match the top bar's rendered chrome.
- **The backdrop menu now lays out against `.viewer`, not `.surround`.** The
  right-click coordinates are still derived from the surround box, but the menu
  element is a sibling of the Inspector so it can paint over it (positioned,
  `z-index: 21`, above the static Inspector column).
- **`recompute()` is an unexercised seam.** It's a no-op and nothing reads
  `signal.cancelled` yet — Slices 8-9 must thread the flag through every `await`
  when they add the real async calls, or stale results can land on the wrong image.
- **Several fixes are visual** (menu-over-Inspector, grid seam, menubar selection)
  and can't be checked headlessly — they were eyeballed in the running app, but
  re-confirm if you touch the layout.

## Manual verification checklist (Done-when from the plan)
1. Open an image → the `◨` button **and** ⌘I both toggle the Inspector column;
   the image refits to the narrower width when it opens.
2. Toggle it open, **quit, relaunch, reopen an image** → the Inspector remembers
   open/closed (`prefs.inspectorOpen`).
3. Page ←/→ with the Inspector open → the panel stays; the (stub) regions are
   keyed to the new image.
4. Right-click near the Inspector edge → the **backdrop menu renders over the
   Inspector**, not clipped.
5. Try to drag-select the header labels (root path / photographer name) → they
   don't highlight.
6. Scroll the grid, open an image → **no grid sliver** bleeds through the seam
   below the menubar.
7. Open an image that fails to decode → the Inspector toggle is hidden and the
   panel doesn't show (gated on `canInspect`).

## How to run
- Dev: `npm run tauri dev` (Rust on PATH via `~/.cargo/env`).
- Frontend: `npm test`, `npm run check`, `npm run build`.

## Workflow note
Same as prior slices: reviewed with `/code-review`; merge to `main` with `--no-ff`
and delete the branch.

## Next: Slice 7 — Eyedropper *(Canvas, ADR-0001)*
Hover the image → report the pixel under the cursor as R / G / B / L (luminosity,
BT.709), rendered into the Inspector's **readout** (Colour) region. Local canvas
work against the displayed image — it does **not** go through `recompute`; it
reuses `viewer/transform.ts` `toSourcePixel` (shipped and tested in Slice 5) to
map cursor → source pixel. The histogram and palette regions stay stubs until
Slices 8-9 fill the `recompute` seam. See `IMPLEMENTATION.md` §Slices/7.
