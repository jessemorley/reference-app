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
list_photographers(root) -> Photographer[]      // hides empty folders
list_images(root, photographerRelPath) -> { categories: Category[], images: RefImage[] }
                                                // root + relPath joined in Rust
ensure_thumb(imgPath) -> string                 // returns cached thumb URL, generates if missing
compute_histogram(imgPath) -> Histogram
extract_palette(imgPath, k) -> Swatch[]         // k in 3..8, default 5, sorted by weight desc
set_cover(photographerRelPath, imgPath)         // store
get_cover(photographerRelPath) -> string | null
reveal_in_finder(path)
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

### 5. Viewer ⬜
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

### 7. Eyedropper ⬜  *(Canvas, ADR-0001)*
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

### 8. Histogram ⬜  *(Rust compute, Canvas draw)*
- `compute_histogram` returns 256-bin r/g/b/l arrays (one decode pass).
- `Histogram.svelte`: RGB channels overlaid (lighten/screen blend) + a luminosity
  toggle; linear scale. Live vertical line follows the eyedropper's hovered value.
- **Done when:** histogram matches the image, toggle works, hover line tracks.

### 9. Colour-scheme extractor ⬜  *(Rust, ADR-0001)*
- `extract_palette`: decode → downsample (~thumbnail size) → k-means in CIELAB →
  swatches sorted by weight desc. `k` selector 3–8, default 5.
- `PaletteBar.svelte`: single proportional bar, segment width = weight. Click a
  segment copies its hex; hover reveals hex/RGB/L; wide segments show hex inline.
- **Done when:** palette reads true to the image, bar is proportional, copy works,
  changing k recomputes instantly.

### 10. Polish ⬜
- Cover pinning: pin action in Viewer / image context menu → `set_cover`; grid
  reflects it. (Pins keyed by relative path — ADR-0002.)
- Photographer search filters the root grid by name.
- Reveal-in-Finder context action on tiles and in Viewer.
- Refresh: ⌘R re-scans; also rescan-on-window-focus.
- **Done when:** pin/search/reveal/refresh all work end to end.

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

---

## Deferred (not v1)

RAW support · live file-watching (`notify`) · SQLite + notes/favourites/tags ·
folder nesting beyond one Category level. None are blocked by this design — each
is an additive slice.
