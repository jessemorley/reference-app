# Handoff: Slice 7 — Eyedropper

## Where things stand
Slices 1–6 are **merged to `main`**. Slice 7 (the Eyedropper) is **built on branch
`slice-7-eyedropper`**, all tests green, and the CORS/`getImageData` done-when was
**confirmed working in the running app this session** — **not yet merged**.

- Frontend: `npm test` → **52 passing** (+11 over Slice 6, all in the new
  `eyedropper.test.ts`). `npm run check` → 0 errors / 0 warnings.
  `npm run build` clean.
- **No Rust changes this slice** — the eyedropper is entirely web-layer canvas
  work (ADR-0001). No new commands; nothing touches `src-tauri/`.
- Branch commits:
  - `7b67441` Slice 7: Eyedropper
  - `e1a93af` Slice 7: refine eyedropper readout
- **Runtime-verified:** hovering reports live R/G/B/L and stays correct when
  zoomed — i.e. the asset-protocol image draws into a non-tainted canvas and
  `getImageData` returns real pixels (the one done-when that needed the live app).

## What Slice 7 added
Defined in `IMPLEMENTATION.md` §Slices/7; design decisions captured there, in the
sharpened **Eyedropper** glossary entry in `CONTEXT.md`, and in **ADR-0003**
(what "L" means).

- **`src/lib/analysis/eyedropper.ts`** (new) — the pure, tested core:
  - `luminance(r,g,b)` — Rec. 709 luma on the **sRGB-encoded bytes**,
    `round(0.2126·R + 0.7152·G + 0.0722·B)`, 0–255 (ADR-0003).
  - `samplingCanvasSize(natural, maxArea)` — natural size, or scaled down
    aspect-preserving to fit WebKit's max canvas area (`4096²`); reference images
    are ~1080p so the cap rarely bites (see `IMPLEMENTATION.md` §Target images).
  - `toCanvasSample(transform, point, natural, canvas)` — inverts the viewer
    transform via `toSourcePixel` (Slice 5), rejects out-of-image points
    (hovering the Backdrop → `null`), then scales source→canvas and floors.
- **`src/lib/stores/eyedropper.ts`** (new) — `reading: writable<{r,g,b,l} | null>`.
  **Transient, never persisted** (unlike `backdrop` / `inspectorOpen`). Viewer
  writes on hover; the Inspector reads it; **Slice 8's histogram hover-line will
  read the same store**.
- **`src/lib/components/Viewer.svelte`** — the (untested) canvas glue:
  - An **`$effect`** builds a sampling canvas when `inspectorOpen && loaded &&
    !failed`: it loads a **separate hidden `<img crossOrigin="anonymous">`** (not
    the display `<img>`), draws it once into an offscreen canvas sized by
    `samplingCanvasSize`, and keeps the 2D context (`willReadFrequently: true`).
    Re-runs on paging (`src`) and on toggling the Inspector; clears `reading` on
    every (re)build and on teardown.
  - **rAF-coalesced** hover: `onSampleMove` stores the cursor point and schedules
    one `sampleNow` per frame; `sampleNow` maps via `toCanvasSample`, reads 1×1,
    sets `reading`. `onSampleLeave` cancels the frame and clears the reading.
    Bound as `onmousemove` / `onmouseleave` on the `.surround`.
  - The zoom **pan-hand cursor is suppressed while the Inspector is open**
    (`grabbable/grabbing` gated on `!$inspectorOpen`) so sampling is precise;
    panning still works, and the pan-hand returns when the Inspector is closed.
- **`src/lib/components/Inspector.svelte`** — the **"Value"** region now renders a
  live readout: a small swatch chip + four integer values on one row, **no
  labels** — the R/G/B *values* are tinted in their channel colours (`#ff6b6b` /
  `#51cf66` / `#5c9dff`), L neutral. Each value sits in a **fixed 3-digit, centred
  slot** so a digit-count change grows symmetrically without nudging neighbours.
  Off-image: values blank, swatch shows an empty dashed chip (no placeholder text).

## Key decisions (from the grilling session)
- **Pixel source = a separate hidden `crossOrigin` image, not the display `<img>`**
  (ADR-0001 approach "A"). Isolates any CORS risk from the working Slice-5 viewer;
  the transient extra decode is released after the one `drawImage`.
- **Capped sampling canvas, not literal source resolution.** A 24MP file would
  exceed WebKit's canvas area and render blank; above the cap each canvas pixel
  covers >1 source pixel and the readout is the nearest sampled pixel — accepted
  (colour judgement, not pixel-forensics; targets are ~1080p anyway).
- **L is luma on the gamma-encoded bytes, not linear luminance** (ADR-0003). This
  is cross-cutting: **Slice 8's `compute_histogram` L channel must use the exact
  same formula**, or the histogram hover-line won't line up with the readout.
- **Active only while the Inspector is open** — no readout target otherwise, and
  it skips the draw/memory cost when analysis is off.

## Gotchas worth knowing
- **Tainted-canvas safety net:** `sampleNow` wraps `getImageData` in `try/catch`;
  on a `SecurityError` it nulls `sampleCtx` (stops sampling) rather than throwing
  every frame. That's a fallback — the live verification above is what actually
  confirms CORS is fine. If a future Tauri/asset-protocol change breaks CORS, the
  readout silently stops; re-run the live check.
- **HEIC/AVIF work in the eyedropper** even though their grid thumbnails are
  placeholders — the hidden source `<img>` decodes natively in WKWebView, so
  `drawImage` + `getImageData` succeed (the `image` crate gates only thumbs). Same
  viewer/grid asymmetry as Slice 5, not a bug.
- **The sampling canvas is rebuilt on every page and every Inspector toggle.** For
  ~1080p that's cheap; if large-file perf ever matters, that rebuild is the place
  to look (e.g. cache by `image.path`).
- **`reading` is the seam Slice 8 shares.** The histogram's live vertical line
  reads this same store; reuse `luminance()` (or match it byte-for-byte) for the
  L channel.

## Manual verification checklist (Done-when from the plan)
1. Open an image, open the Inspector (⌘I) → hovering the image shows live R/G/B/L
   and a matching swatch; moving off the image blanks the values + empties the chip.
2. Zoom in (⌘+) and pan → the readout still reports the **correct source pixel**
   (the transform inverse holds), and the cursor stays a plain pointer for aiming.
3. Hover the Backdrop (outside the image) → no reading.
4. Page ←/→ with the Inspector open → the canvas rebuilds for the new image;
   stale readings don't linger.
5. Open a HEIC/AVIF (grid tile is a placeholder) → the eyedropper still reads.
6. Watch a 2↔3 digit channel change → values grow about their centre, neighbours
   don't shift.

## How to run
- Dev: `npm run tauri dev` (Rust on PATH via `~/.cargo/env`).
- Frontend: `npm test`, `npm run check`, `npm run build`.

## Workflow note
Same as prior slices: review with `/code-review`; merge to `main` with `--no-ff`
and delete the branch.

## Next: Slice 8 — Histogram *(Rust compute, Canvas draw)*
`compute_histogram(imgPath)` returns 256-bin r/g/b/l arrays in one decode pass
(Rust, off the UI thread) — wired through the `recompute` seam in
`Inspector.svelte` (honour `signal.cancelled` on the await). `Histogram.svelte`
draws the RGB channels overlaid (lighten/screen) with a luminosity toggle, linear
scale, and a **live vertical line that follows the eyedropper's hovered value**
— read from the `reading` store this slice added. **The L channel must use the
Slice-7 `luminance()` definition (ADR-0003)** so the line and readout agree. See
`IMPLEMENTATION.md` §Slices/8.
