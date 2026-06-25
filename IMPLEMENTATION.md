# Implementation Plan

Build order is **vertical slices**: each slice ends in something you can open and
use. Slices 1–5 give a working browser before any analysis exists; the three
analysis tools (7, 8, 9) land independently.

See `CONTEXT.md` for domain terms and `docs/adr/` for the analysis-split (0001),
pin-storage (0002), and luminosity-definition (0003) decisions.

---

## Stack

- **Shell**: Tauri 2.x, target macOS 26+.
- **Frontend**: Svelte + Vite + TypeScript.
- **Backend**: Rust — `image` (decode/thumbnail/histogram), `palette` or
  hand-rolled k-means for the colour scheme, `tauri-plugin-store` (persistence),
  `tauri-plugin-opener` (reveal-in-Finder).
- **Appearance**: fixed dark vibrancy chrome (`NSVisualEffectView` via Tauri
  window `effects`); not system-following.

## Target images

Reference images are mostly **~1080p PNG/JPG gathered from Instagram**, not large
camera originals. Sizing decisions assume this common case: thumbnails, the
viewer, and the analysis tools are tuned for screen-resolution images. Large
files (multi-megapixel originals, RAW is out of scope) are the rare case and only
need to degrade gracefully, not be optimised for — e.g. the Slice-7 eyedropper
caps its sampling canvas (below) rather than guaranteeing 1:1 fidelity on a 24MP
file.

## Project layout

```
reference-app/
├── src/                          # Svelte frontend
│   ├── lib/
│   │   ├── ipc.ts                # typed wrappers over Tauri commands
│   │   ├── types.ts              # shared TS types (mirror Rust structs)
│   │   ├── stores/               # Svelte stores: root, navigation, settings
│   │   ├── analysis/
│   │   │   ├── eyedropper.ts     # Canvas hover → R/G/B/L (source-pixel mapped)
│   │   │   └── draw-histogram.ts # Canvas draw of Rust-computed channel arrays
│   │   └── components/
│   │       ├── PhotographerGrid.svelte
│   │       ├── PhotographerView.svelte   # flattened grid + Category tabs
│   │       ├── Viewer.svelte
│   │       ├── Inspector.svelte
│   │       ├── PaletteBar.svelte
│   │       └── Histogram.svelte
│   ├── App.svelte
│   ├── App.test.ts             # Vitest component test
│   └── main.ts
├── src-tauri/
│   └── src/
│       ├── lib.rs                # command registration
│       ├── scan.rs               # photographers, categories, images
│       ├── thumbs.rs             # thumbnail generation + disk cache
│       └── analysis.rs           # histogram + palette
├── CONTEXT.md
├── IMPLEMENTATION.md
└── docs/adr/
```

---

## IPC contract

Shared shapes (Rust struct ⇄ TS type in `types.ts`):

```ts
type Photographer = {
  name: string;
  relPath: string;        // relative to Root — the pin key (ADR-0002)
  coverPath: string | null;   // absolute path of the cover image; the tile
                              // thumbnails it on demand via ensureThumb (Slice 3)
  pinned: boolean;        // coverPath is a user pin vs. alphabetical default
                          // (Slice 10) — drives the tile menu's state
};

type Category = { name: string; count: number };  // "Uncategorised" is synthetic

type RefImage = {
  name: string;
  path: string;           // absolute; full-res asset-protocol load AND the
                          // grid derives the cached thumb from it via
                          // ensureThumb / Thumb.svelte (no separate thumb field)
  category: string | null; // null = loose
};

type Histogram = { r: number[]; g: number[]; b: number[]; l: number[] }; // 256 bins each
type Swatch = { hex: string; r: number; g: number; b: number; weight: number }; // weight 0..1
```

Tauri commands:

```
select_root() -> string | null                 // dialog, persists to store
get_root() -> string | null
list_photographers(root) -> Photographer[]      // hides empty folders; cover = pinned image
                                                // (if still on disk) else first alphabetically
list_images(root, photographerRelPath) -> { categories: Category[], images: RefImage[] }
                                                // root + relPath joined in Rust
ensure_thumb(imgPath) -> string                 // returns cached thumb URL, generates if missing
compute_histogram(imgPath) -> Histogram
extract_palette(imgPath, k) -> Swatch[]         // k in 3..8, default 5, sorted by weight desc
set_cover(photographerRelPath, imgPath | null)  // null clears the pin (reset to default).
                                                // Pins live in the settings store (ADR-0002);
                                                // list_photographers resolves them, so there is
                                                // no separate get_cover — the grid never asks.
reveal_in_finder(path)                          // file or folder; tauri-plugin-opener
```

---

## Testing

- **Frontend**: Vitest + `@testing-library/svelte` (jsdom). Config lives in
  `vitest.config.ts`, which layers a test-only `svelteTesting()` plugin over the
  Tauri-focused `vite.config.ts`; matchers are registered in `vitest-setup.ts`.
  Run with `npm test` (or `npm run test:watch`).
  - `src/App.test.ts` covers `App.svelte`'s three-way branching
    (loading → first-run `RootPicker` → loaded shell) plus the change-folder
    path, mocking `src/lib/ipc.ts`.
- **Backend**: `cargo test` in `src-tauri/`. Thin command glue
  (`select_root` / `get_root`) is left untested; the pure folder-walking rules
  in `scan.rs` (Slice 2+) are the first real targets.
- General rule: test pure logic, not native-dialog/store glue.

---

## Slices

Status: ✅ done · 🚧 in progress · ⬜ not started. (Source of truth is git
history — `Slice N` / `Merge slice N` commits; these markers mirror it.)

### 1. Skeleton ✅
- Scaffold Tauri 2 + Svelte + TS. Dark vibrancy window, hidden-inset titlebar.
- `select_root` / `get_root` via `tauri-plugin-store`. First-run shows a
  "Select your photography folder" screen; on relaunch, jump straight in.
- **Done when:** app launches, you pick a folder, relaunch lands back in it.

### 2. Photographer grid ✅
- `list_photographers`: Root's subdirs only; skip dirs with zero images
  (recursively — a photographer with images only inside Categories still counts).
- Tiles render Cover = first image alphabetically (full-res for now), name overlaid.
- **Done when:** grid shows one tile per non-empty photographer with a cover + name.

### 3. Thumbnail cache ✅  *(see ADR-0001 for why Rust owns this)*
- `thumbs.rs`: downscale to grid size, write to app cache dir, key
  `hash(path + mtime + size)`. `ensure_thumb` returns cached URL or generates.
- Generate concurrently on scan; grid fills in progressively.
- Point grid tiles at `coverThumb` / `thumb` instead of full-res.
- **Done when:** a 200-image folder scrolls smoothly; re-opening is instant;
  replacing a file on disk regenerates its thumb (mtime/size change).

### 4. Photographer view ✅
- `list_images`: walk Photographer folder one level deep. Loose images →
  `category: null`; subfolder images → that Category. Build the Category list.
- Flattened image grid + tab bar: "All" first, then Categories alphabetically.
  "Uncategorised" tab only when loose images **and** ≥1 real Category coexist.
  No tab bar when everything is loose.
- Tabs filter the grid; track active tab in a navigation store.
- **Done when:** clicking a photographer shows all their images, tabs filter correctly.

### 5. Viewer ✅
- Click an image → Viewer overlay, full-res via asset protocol
  (`convertFileSrc` on the original path; the Root is already in the asset scope,
  `lib.rs` `allow_root_assets`). The overlay covers the **content region** (below
  the titlebar + header); a corner **expand toggle** grows it to fill the window
  (expanded state is **ephemeral** — every open starts windowed). Driven by props
  from `PhotographerView` (`images` = the active tab's `shown` set + `openIndex`):
  no new store state, no re-deriving the filter — the viewer is a dumb overlay.
- **Backdrop** (black `#000` / white `#fff` / grey `#7f7f7f`, **default grey**) via
  **right-click on the surround** → custom HTML context menu (dark-glass, current
  one check-marked). Persisted globally through `get_setting`/`set_setting`
  (key `prefs.backdrop`, store the token not the hex), hydrated in `App.svelte`
  alongside tile sizes, exposed via a `backdrop` store. Right-clicking the *image*
  is reserved for slice-10 image actions (pin / reveal) — surround vs image are
  two distinct right-click targets.
- **⌘+ / ⌘− zoom** (anchored at viewport centre), **⌘0** resets to fit. **Drag and
  scroll both pan** (only when zoomed past fit; scroll is *not* zoom). Min scale =
  fit (capped at 1.0), max = `max(1.0, 3·fit)`. Transform is a single
  `{ scale, tx, ty }` in pure `lib/viewer/transform.ts`, kept invertible
  (`toSourcePixel`) so the slice-7 eyedropper just inverts it.
- **← / → page** the active set, **wrapping** (↑/↓ inert). Transform resets to fit
  on each page; **backdrop + expand persist across paging**. **Escape** closes the
  viewer outright (windowed or expanded); it does not pop the whole photographer
  view (the header back button still does that).
- Full-res `<img decoding="async">`, swapped in on `img.decode()` (plain loading
  state until then); `onerror` → centred "can't display this image" state.
  **HEIC/AVIF decode natively in WKWebView**, so they show in the viewer even
  though their grid tiles are placeholders (the `image` crate can't thumbnail
  them — grid/viewer format asymmetry is expected, not a bug).
- **Testing**: pure `lib/viewer/transform.ts` (`fitScale`, `clampScale`,
  `zoomToward`, `clampPan`, `wrapIndex`, `toSourcePixel`) under Vitest; the
  pointer/keyboard/`.decode()`/context-menu glue stays untested.
- **Done when:** open / zoom (⌘±, ⌘0) / pan / arrow-through (wrapping) / escape all
  work; backdrop sticks across relaunch; expand toggles.

### 6. Inspector shell ✅
- Right-hand glass panel, single toggle (button + shortcut), state remembered.
  Viewer-bound: only renders while a Reference image is open, but the shown-state
  is a durable global preference (`prefs.inspectorOpen`, default closed). Toggle
  is the control-cluster button + ⌘I (matches Preview). Insets the surround (its
  own column) rather than floating, so the whole image stays hoverable for the
  Slice-7 eyedropper and the fit math tracks the shrunk `vw` for free.
- Lays out three regions, top to bottom **readout → histogram → palette** (the
  two eyedropper-coupled tools adjacent), empty stubs for now.
- Compute-on-open wiring: `Inspector.svelte` renders only when open and unmounts
  on close, so an `image.path`-keyed `$effect` with a cancellation flag *is* the
  trigger (fires on open + on paging to a new image). Slices 8–9 fill the
  `recompute` seam; debounce on rapid paging deferred to when real compute lands.
- **Done when:** panel toggles, remembers open/closed across launches.

### 7. Eyedropper ✅  *(Canvas, ADR-0001)*
- **Pixel source:** a *separate* hidden `<img crossOrigin="anonymous">` per open
  image (not the display `<img>`), drawn once into a sampling `<canvas>` and then
  released — the display image is left untouched so a CORS misstep can't regress
  the Slice-5 viewer. `crossOrigin="anonymous"` + Tauri's asset-protocol CORS
  headers keep the canvas origin-clean so `getImageData` works; **verifying that
  at runtime is part of "done"**, not just compiling.
- **Canvas size:** capped to WebKit's max canvas area (≈16.7M px) preserving
  aspect, *not* literal source resolution — a 24MP file would blow the limit and
  render blank. For ~1080p targets (see Target images) the cap never bites; above
  it, each canvas pixel covers >1 source pixel and the readout is the nearest
  sampled pixel (acceptable — this is colour-judgement, not pixel-forensics).
- **Active only while the Inspector is open** (`inspectorOpen && loaded &&
  !failed`): no readout target otherwise, and it skips the draw/memory cost when
  analysis is off. The sampling canvas is built in the Viewer (it owns the image
  load lifecycle + transform + surround handlers); torn down on close.
- `mousemove` (rAF-coalesced to one read per frame) → map cursor to the
  **source** pixel via `toSourcePixel` (transform.ts, already proven), then a
  source→canvas scale, read 1×1, compute L.
- **L = Rec. 709 luma on the sRGB bytes** — `round(0.2126·R + 0.7152·G +
  0.0722·B)`, 0–255, *not* linearized luminance (ADR-0003; Slice 8's histogram L
  channel must match).
- **Data flow:** a transient `eyedropper` store (`writable<{r,g,b,l} | null>`,
  never persisted). Viewer writes on hover; the Inspector's "Value" region reads
  it (and Slice 8's histogram hover-line will read the same source). Resets to
  `null` on image change, mouse-leave, and Inspector close.
- **Readout:** a single row — a small swatch chip of the hovered colour beside
  the four integer values 0–255, with no labels: the R/G/B *values* are tinted in
  their channel colours, L neutral. With no reading (cursor off the image) the
  values blank out and the swatch shows an empty dashed chip — no placeholder text.
- **Cursor:** the zoomed pan-hand (grab/grabbing) is suppressed while the
  Inspector is open, so a plain cursor allows precise sampling; panning still
  works, and the pan-hand returns when the Inspector is closed.
- **HEIC/AVIF work here** — the hidden source `<img>` decodes natively in
  WKWebView, so `drawImage` + `getImageData` succeed even though the `image`
  crate can't thumbnail those formats (same asymmetry as the viewer, not a bug).
- **Testing:** pure + tested — `luminance(r,g,b)`, `samplingCanvasSize(natural,
  maxArea)` (aspect-preserving under the cap), and `toCanvasSample(transform,
  point, natural, canvasSize)` → `{x,y} | null` (source→canvas map + bounds
  check). Canvas / `getImageData` / rAF / store wiring stays untested glue (the
  Slice-5 pattern).
- **Done when:** hovering reports correct values, still correct when zoomed in,
  and a real `getImageData` read returns non-tainted pixels on an asset-protocol
  image.

### 8. Histogram ✅  *(Rust compute, Canvas draw)*
- `compute_histogram` returns 256-bin r/g/b/l arrays (one decode pass). L channel
  uses the exact ADR-0003 luma formula so the hover line lines up with the readout.
- `Histogram.svelte`: **all four channels shown at once, no toggle** —
  Lightroom-style (see `screenshots/histogram_example.png`). **L is the filled
  layer**: a soft grey area = the luminosity envelope. **R/G/B are thin translucent
  line strokes on top**, additively blended (screen/lighten) so they read white
  where all three overlap (the peaks). Near-black plot area (darker than the
  `#1e1e1e` inspector chrome), very faint grid lines (vertical thirds / horizontal
  quarters), no axis labels (the reference's ISO/shutter/f-stop row is Lightroom
  EXIF — we have no equivalent).
- **Vertical scale:** **linear** (`SCALE_EXPONENT = 1.0`), normalised to the shared
  max across all four channels, after a light **5-tap smoothing** pass.
  **Photoshop is the source of truth** (`screenshots/newhist/photoshop.png`): a
  linear scale keeps sparse dark/bright tails at the floor, so the luma curve lifts
  only where real density is rather than climbing from the very edge. Compressing
  the scale (the `<1` exponents we explored for the Capture One look —
  `captureoneone_hist1.png`) amplifies those sparse-but-real tails into visible
  height, which measures wrong against PS. The exponent stays a tuning knob in
  draw-histogram.ts.
- **Hover line:** a *single* **amber** vertical line at `reading.l`, marking the
  hovered pixel on the L envelope (amber stays visible over both the grey fill and
  the white overlap peaks — matches the reference). Hidden when `reading` is
  `null`. Not three per-channel ticks — one line, one value (luma), one code path.
- **Blend:** grey L area drawn first (source-over), then the three R/G/B strokes
  with `globalCompositeOperation = "screen"` (or `"lighten"`) so overlaps go white.
- **HEIC/AVIF & any decode failure:** `compute_histogram` errors (the `image`
  crate can't decode HEIC/AVIF — same asymmetry as viewer/eyedropper, which decode
  natively in WKWebView). The region shows a quiet "unavailable" empty state (the
  existing dashed stub); the eyedropper readout above it still works. One empty
  state covers unsupported-format and corrupt-file alike.
- **Paging:** the call lands in `Inspector.svelte`'s `recompute` seam. Clear the
  region to its loading state immediately on image-change, **debounce ~120ms**
  before firing `compute_histogram` (reset on re-page), and keep the existing
  cancellation flag to drop stale results. No result cache — recompute on open is
  fine for ~1080p targets.
- **Testing:** Rust — bins sum to pixel count, and L matches ADR-0003's formula on
  a known pixel. JS — pure normalisation (percentile-clip + shared-max → bar
  heights) in `draw-histogram.ts`. Canvas draw / IPC / toggle wiring stays untested
  glue (the Slice-5/7 pattern).
- **Done when:** histogram matches the image (all four channels visible, L legible
  over RGB), hover line tracks the eyedropper, HEIC/AVIF show the unavailable state
  without breaking the readout.

### 9. Colour-scheme extractor ✅  *(Rust, ADR-0001)*
- `extract_palette`: decode → downsample (~128px, `PALETTE_SAMPLE`) → k-means in
  CIELAB → swatches sorted by weight desc. `k` selector 3–8, default 5 (clamped in
  Rust). Clustering in Lab (not RGB) so swatches split on perceptual difference.
  Empty clusters are dropped, so a flat image yields fewer than `k` swatches. Same
  blocking-pool decode + decode-failure path as `compute_histogram` (HEIC/AVIF →
  unavailable).
- **Salience weighting** (`salience`, `CHROMA_BOOST`/`CHROMA_REF` knobs): pixels are
  weighted `1 + boost·chroma`, so a small but vivid accent (a red panel on an
  otherwise neutral scene) counts for several plain pixels. This drives the centroid
  (it stays vivid instead of muddying to an area average) and the reported `weight`
  (its bar segment reads as visible, not a sliver). Pure area weighting
  under-represented exactly the eye-catching colours — `screenshots/palette1.png`/
  `palette2.png`.
- **Greedy farthest-first seeding** (`seed_centroids`, deterministic — no RNG): seed
  0 is the salience-weighted mean (anchors the bulk), then each next seed is the
  pixel maximising `weight·distance²`. This *reliably* grabs the most
  chromatically-isolated regions, where probability-proportional k-means++ could
  skip a small hue-isolated accent on an unlucky draw — the blue lid/necklace in
  `screenshots/pallette3.png`/`pallette4.png` that earlier seeding missed.
- **Over-segment then merge for distinct colours** (`PALETTE_OVERSEG`,
  `merge_clusters`, `merge_dist2`, `SHADE_FOLD`): k-means runs with `k·OVERSEG`
  clusters (k-means can't merge two seeds, so a highlight keeps its own slot from
  the body of one object), then the closest pairs are agglomeratively merged back
  to `k`. The merge metric is **hue-aware**: it splits the Lab gap into ΔL / ΔC
  (chroma magnitude) / ΔH (hue) and folds ΔL+ΔC for *saturated* pairs (so a bright
  and a dark red — same hue — fuse) while leaving neutrals (black/grey/white,
  ~0 chroma) unfolded so they stay distinct. So the `k` swatches are genuinely
  different colours, not two/three shades of one — the pallette3 teapot reds.
- `PaletteBar.svelte`: single proportional bar, segment `flex-grow` = weight. Click
  a segment copies its hex (`navigator.clipboard`, brief "copied" flash); hover /
  focus reveals hex/RGB/L (`L` via the shared `luminance`) + % below the bar; wide
  segments show their hex inline (contrast ink by luma).
- Palette has its own compute `$effect` in `Inspector.svelte` (keyed on image +
  `k`) so changing `k` recomputes the palette alone without re-decoding the
  histogram; same ~120ms debounce / cancellation / loading-ready-unavailable states.
- **Testing:** Rust — Lab round-trips within a byte; a solid image collapses to one
  full-weight swatch; a two-colour split yields two ~0.5-weight swatches summing to
  1. JS contrast/threshold helpers reuse the already-tested `luminance`.
- **Done when:** palette reads true to the image, bar is proportional, copy works,
  changing k recomputes instantly.

### 10. Polish ✅
Four independent quality-of-life features. Pins keyed by relative path (ADR-0002).

- **Cover pinning.** `set_cover(relPath, imgPath | null)` writes a `covers` map
  into `settings.json`; `list_photographers` gains the `app` handle and resolves
  the cover itself — pinned image if it still exists on disk, else `find_cover`
  (first alphabetically). The pin override is the only place "what is the cover"
  is decided, so there's no separate `get_cover`. Action lives in a **state-aware
  right-click menu on photographer-view image tiles**: "Set as cover" on a normal
  tile, "Reset to default cover" on the currently-pinned tile (passes `null`),
  "Current cover" (disabled) on the un-pinned alphabetical default. No persistent
  cover badge — state shows only in the menu.
- **Photographer search.** An always-visible search field in the root header.
  Live case-insensitive substring match on photographer name, filtered
  client-side over the already-loaded list (no IPC). "No photographers match…"
  empty state; cleared when the folder changes.
- **Reveal in Finder.** `reveal_in_finder(path)` (tauri-plugin-opener). Two
  surfaces: the image-tile right-click menu (shares the cover menu) reveals the
  **image file**; an in-window button in the photographer-view header reveals the
  **photographer folder**. No Viewer action, no root-grid tile menu.
- **Refresh.** ⌘R re-runs the current view's scan in place (stay in the open
  photographer, preserve scroll; the "Scanning…" state is first-load only so an
  unchanged rescan is silent). Auto-rescan on window focus **only when the window
  was unfocused > ~5s** (debounced — don't walk the tree on a quick tab-away).
  The thumb cache self-heals via its `hash(path+mtime+size)` key, so no
  invalidation step. If the open photographer's folder vanished during a rescan,
  fall back to the root grid.
- **Done when:** pinning sets/resets a tile's cover and survives relaunch; search
  filters the grid live; reveal opens Finder on the right file/folder from both
  surfaces; ⌘R and a >5s focus return both reflect on-disk adds/edits/deletes.

### 11. Photographer info ⬜
- Per-photographer metadata: Instagram link + short blurb. Stored in a hidden
  file inside each photographer folder (e.g. `.refapp.json` / `.refapp.toml`),
  so it travels with the folder rather than living in the app store.
- `scan.rs` reads the file when listing photographers; missing/malformed file →
  no info (don't break the grid). Surface on `Photographer` (e.g. add
  `instagram: string | null`, `blurb: string | null` to the IPC shape).
- Show in `PhotographerView` header: blurb text + Instagram link
  (opens externally via `tauri-plugin-opener`).
- Editable in-app: an edit affordance in the header opens a small form
  (blurb + Instagram); saving writes the hidden file via a new command
  (e.g. `set_photographer_info(relPath, { instagram, blurb })`). Create the
  file on first save; the folder needn't already have one.
- **Done when:** a folder with the hidden file shows its blurb + working
  Instagram link; a folder without one renders cleanly with no info; editing
  in-app persists to the hidden file and survives relaunch.

### 12. Vectorscope ⬜  *(Rust compute, Canvas draw — sibling of Slice 8)*
A chroma scope for the Inspector: the same shape of feature as the histogram (a
whole-image batch pass in Rust per ADR-0001, drawn on a Canvas in the web layer),
but a **2D** density over the colour plane instead of four 1D channels.
Conceptually it belongs beside the histogram in the 7–9 analysis block; it's
numbered 12 only so the existing `Slice N` commit markers keep their meaning.
- **Chroma space:** Rec. 709 **Cb/Cr** — reuse the exact luma weights already in
  `analysis.rs` (`luma`, ADR-0003) so the scope agrees with the histogram L and the
  eyedropper. `Cb = (B − Y)/1.8556`, `Cr = (R − Y)/1.5748`, each in roughly
  −0.5..0.5; map to the unit square, drop anything outside the inscribed circle.
- **`compute_vectorscope(imgPath) -> Vectorscope`** (new free fn + thin
  `#[tauri::command]`, same blocking-pool decode pattern as `compute_histogram`).
  Returns a single **128×128** row-major `Vec<u32>` density grid (`{ size: 128,
  grid: number[] }` — 16 KB over IPC, plenty for ~1080p references; 256 was 256 KB
  for no visible gain). Pure `vectorscope(&RgbImage)` is the unit-tested seam.
- **`Vectorscope.svelte`** (mirrors `Histogram.svelte`): square canvas, DPR-sized,
  near-black `#141414` plot. Draw each non-empty cell at its (Cb,Cr) position,
  **tinted with the colour that chroma actually represents** (reconstruct an RGB at
  mid-luma from the cell's Cb/Cr) and **brightness ∝ density on a sqrt/log scale**
  (chroma density spans orders of magnitude — a linear scale shows only the few
  hottest cells). Neutral greys pile at the centre, saturated colour pushes to the
  rim. The pure density→pixel shaping lives in `draw-vectorscope.ts` and is tested;
  the canvas/IPC wiring stays untested glue (Slice-5/7/8 pattern).
- **Graticule:** just the bounding **circle** + a faint centre cross. Skin-tone
  line and the six colour-target boxes (R/G/B/C/M/Y) are deferred — add them if the
  bare scope reads ambiguous.
- **Hover:** plot the eyedropper's current pixel as a small **amber crosshair** at
  its Cb/Cr (read the same `reading` store the histogram's hover line uses), so
  hovering the image shows where that pixel sits on the wheel. Hidden when `reading`
  is `null`.
- **Paging / states:** joins `Inspector.svelte`'s existing compute-on-open
  `$effect` — run alongside `computeHistogram` in the same debounced, cancellable
  call (one decode-failure path drives both). Add a fourth Inspector region
  ("Vectorscope") below the palette, with the same loading / ready / **unavailable**
  (HEIC/AVIF & decode failures) states as the histogram.
- **Wiring:** add `Vectorscope` to `types.ts` and a `computeVectorscope` wrapper to
  `ipc.ts`; register the command in `lib.rs`; add the `compute_vectorscope` line to
  the IPC-contract section above.
- **Testing:** Rust — grid sums to pixel count; a solid neutral grey lands a single
  hot cell at the centre; a saturated primary lands off-centre toward the rim. JS —
  pure density→brightness shaping in `draw-vectorscope.ts`.
- **Done when:** the scope matches the image (neutral images stay centred, saturated
  ones spread to the rim with correct hues), the hover crosshair tracks the
  eyedropper, and HEIC/AVIF show the unavailable state without breaking the readout.

### 13. Waveform (luma) ⬜  *(Rust compute, Canvas draw — sibling of Slice 8)*
A luma waveform for the Inspector: per-image-**column** value distribution, the
exposure-across-the-frame scope. Same ADR-0001 split as the histogram/vectorscope
(one Rust decode pass → grid → Canvas draw, joins the Inspector compute seam).
Unlike the other two scopes its **x-axis is spatial** — left of the plot = left of
the image — so a bright region's horizontal position is preserved.
- **`compute_waveform(imgPath) -> Waveform`** (new free fn + thin
  `#[tauri::command]`, blocking-pool decode like `compute_histogram`). For each
  pixel: x → its column **binned down to a fixed 256-wide** display axis, y → its
  ADR-0003 luma (reuse `analysis.rs::luma` so it agrees with the histogram L /
  eyedropper). Returns a constant **256×256** row-major `Vec<u32>` density grid
  (`{ size: 256, grid: number[] }`) regardless of image size — column binning keeps
  the payload constant (~256 KB; fine for ~1080p). Pure `waveform(&RgbImage)` is the
  tested seam.
- **`Waveform.svelte`** (mirrors `Histogram.svelte`): canvas, DPR-sized, near-black
  `#141414` plot, value **0 at the bottom, 255 at the top**. Draw each non-empty
  cell as a neutral white/grey dot with **brightness ∝ density on a sqrt/log scale**
  (column density spans orders of magnitude — linear shows only the hottest cells).
  Trace colour stays a tuning knob in `draw-waveform.ts` (classic scopes are green;
  default neutral to match the chrome). Faint grid: horizontal quarters (value),
  no vertical lines (x is continuous image space). Pure density→brightness shaping
  lives in `draw-waveform.ts` and is tested; canvas/IPC wiring is untested glue.
- **Hover:** the one extra wiring touch — the `eyedropper` store's `Reading`
  currently carries only `{r,g,b,l}`, no position, so a column marker needs a
  **normalised source `x` (0..1)** added to `Reading`, set in `Viewer.svelte` where
  the sample is already taken (it has the source pixel). The waveform then draws an
  **amber vertical line** at that column (mirrors the histogram's hover line, which
  is vertical-at-L). Hidden when `reading` is `null`. *Lazy alt:* ship without the
  marker and add `x` later — the scope is useful without it.
- **Paging / states:** joins `Inspector.svelte`'s compute-on-open `$effect`
  alongside `computeHistogram`/`computeVectorscope` (one debounced, cancellable call;
  one decode-failure path). Adds a "Waveform" Inspector region with the same loading
  / ready / **unavailable** (HEIC/AVIF & decode failures) states.
- **Wiring:** add `Waveform` to `types.ts`, a `computeWaveform` wrapper to `ipc.ts`,
  the `x` field to `Reading`, register the command in `lib.rs`, and add
  `compute_waveform` to the IPC-contract section above.
- **Testing:** Rust — grid sums to pixel count; a solid mid-grey lands a single hot
  value-row spanning all columns; a left-half-white / right-half-black image lands
  density only in the top-left and bottom-right quadrants. JS — pure
  density→brightness shaping in `draw-waveform.ts`.
- **Done when:** the waveform tracks exposure across the frame (a bright left edge
  lifts the left of the trace), the hover line tracks the eyedropper's column, and
  HEIC/AVIF show the unavailable state without breaking the readout.

---

## Deferred (not v1)

RAW support · live file-watching (`notify`) · SQLite + notes/favourites/tags ·
folder nesting beyond one Category level. None are blocked by this design — each
is an additive slice.
