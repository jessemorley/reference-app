# Implementation Plan

Build order is **vertical slices**: each slice ends in something you can open and
use. Slices 1–5 give a working browser before any analysis exists; the three
analysis tools (7, 8, 9) land independently.

See `CONTEXT.md` for domain terms and `docs/adr/` for the analysis-split (0001)
and pin-storage (0002) decisions.

---

## Stack

- **Shell**: Tauri 2.x, target macOS 26+.
- **Frontend**: Svelte + Vite + TypeScript.
- **Backend**: Rust — `image` (decode/thumbnail/histogram), `palette` or
  hand-rolled k-means for the colour scheme, `tauri-plugin-store` (persistence),
  `tauri-plugin-opener` (reveal-in-Finder).
- **Appearance**: fixed dark vibrancy chrome (`NSVisualEffectView` via Tauri
  window `effects`); not system-following.

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
  coverThumb: string | null;  // asset-protocol URL of the cover thumbnail
};

type Category = { name: string; count: number };  // "Uncategorised" is synthetic

type RefImage = {
  name: string;
  path: string;           // absolute, for full-res asset-protocol load
  thumb: string;          // asset-protocol URL of cached thumbnail
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
list_images(photographerRelPath) -> { categories: Category[], images: RefImage[] }
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

### 1. Skeleton
- Scaffold Tauri 2 + Svelte + TS. Dark vibrancy window, hidden-inset titlebar.
- `select_root` / `get_root` via `tauri-plugin-store`. First-run shows a
  "Select your photography folder" screen; on relaunch, jump straight in.
- **Done when:** app launches, you pick a folder, relaunch lands back in it.

### 2. Photographer grid
- `list_photographers`: Root's subdirs only; skip dirs with zero images
  (recursively — a photographer with images only inside Categories still counts).
- Tiles render Cover = first image alphabetically (full-res for now), name overlaid.
- **Done when:** grid shows one tile per non-empty photographer with a cover + name.

### 3. Thumbnail cache  *(see ADR-0001 for why Rust owns this)*
- `thumbs.rs`: downscale to grid size, write to app cache dir, key
  `hash(path + mtime + size)`. `ensure_thumb` returns cached URL or generates.
- Generate concurrently on scan; grid fills in progressively.
- Point grid tiles at `coverThumb` / `thumb` instead of full-res.
- **Done when:** a 200-image folder scrolls smoothly; re-opening is instant;
  replacing a file on disk regenerates its thumb (mtime/size change).

### 4. Photographer view
- `list_images`: walk Photographer folder one level deep. Loose images →
  `category: null`; subfolder images → that Category. Build the Category list.
- Flattened image grid + tab bar: "All" first, then Categories alphabetically.
  "Uncategorised" tab only when loose images **and** ≥1 real Category coexist.
  No tab bar when everything is loose.
- Tabs filter the grid; track active tab in a navigation store.
- **Done when:** clicking a photographer shows all their images, tabs filter correctly.

### 5. Viewer
- Click an image → full-screen Viewer, full-res via asset protocol.
- Backdrop selector (black / white / grey), persisted.
- Scroll-to-zoom + drag-to-pan. Arrow keys page within the **active tab's** set,
  wrapping; Escape closes.
- **Done when:** open/zoom/pan/arrow-through/escape all work; backdrop sticks.

### 6. Inspector shell
- Right-hand glass panel, single toggle (button + shortcut), state remembered.
- Lays out three regions: readout, palette bar, histogram (empty stubs for now).
- Compute-on-open wiring (calls land in 7–9).
- **Done when:** panel toggles, remembers open/closed across launches.

### 7. Eyedropper  *(Canvas, ADR-0001)*
- Hidden source-resolution `<canvas>` per open image. `mousemove` → map cursor to
  **source** pixel (account for zoom/pan transform), read 1×1, compute L (BT.709).
- Readout shows R/G/B/L live.
- **Done when:** hovering reports correct values, still correct when zoomed in.

### 8. Histogram  *(Rust compute, Canvas draw)*
- `compute_histogram` returns 256-bin r/g/b/l arrays (one decode pass).
- `Histogram.svelte`: RGB channels overlaid (lighten/screen blend) + a luminosity
  toggle; linear scale. Live vertical line follows the eyedropper's hovered value.
- **Done when:** histogram matches the image, toggle works, hover line tracks.

### 9. Colour-scheme extractor  *(Rust, ADR-0001)*
- `extract_palette`: decode → downsample (~thumbnail size) → k-means in CIELAB →
  swatches sorted by weight desc. `k` selector 3–8, default 5.
- `PaletteBar.svelte`: single proportional bar, segment width = weight. Click a
  segment copies its hex; hover reveals hex/RGB/L; wide segments show hex inline.
- **Done when:** palette reads true to the image, bar is proportional, copy works,
  changing k recomputes instantly.

### 10. Polish
- Cover pinning: pin action in Viewer / image context menu → `set_cover`; grid
  reflects it. (Pins keyed by relative path — ADR-0002.)
- Photographer search filters the root grid by name.
- Reveal-in-Finder context action on tiles and in Viewer.
- Refresh: ⌘R re-scans; also rescan-on-window-focus.
- **Done when:** pin/search/reveal/refresh all work end to end.

---

## Deferred (not v1)

RAW support · live file-watching (`notify`) · SQLite + notes/favourites/tags ·
folder nesting beyond one Category level. None are blocked by this design — each
is an additive slice.
