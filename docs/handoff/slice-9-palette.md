# Handoff: Slice 9 — Colour-scheme extractor

## Where things stand
Slices 1–9 are **merged to `main`** (`main` pushed to origin). Slice 9 (the
Colour-scheme extractor) was built on `slice-9-palette`, reviewed with
`/code-review` (high effort), **iterated against real images this session**, then
**merged `--no-ff` and the branch deleted** — merge commit `1e4455b`.

- Frontend: `npm test` → **56 passing**, `npm run check` → 0 errors / 0 warnings.
- Backend: `cargo test` → **32 passing** (8 in `analysis`, 6 of them new palette
  tests). `cargo clippy` clean on `analysis.rs` (two pre-existing `scan.rs`
  warnings untouched).
- Slice commits (now on `main`):
  - `e95a69c` Slice 9: Colour-scheme extractor *(base: salience + greedy seeding)*
  - `f755b56` distinct-colour palette (over-segment then hue-aware merge)
  - `4762e59` floor palette segment width so small accents stay visible
  - `72a48d1` persist palette colour-count across remounts and relaunch
  - `40d11a1` replace palette colours dropdown with −/+ stepper
  - `c3c7206` square palette segments so only the bar's outer edge is rounded
  - `7a47507` review fixes — stale PaletteBar state, comment, palette-k heal
- **Runtime-verified:** palette reads true to the image, bar is proportional,
  click-to-copy works, and changing k recomputes — confirmed in the running app
  against four real references (`screenshots/palette1.png`..`pallette4.png`),
  which is what drove the algorithm past the naïve first cut (see below).

## What Slice 9 added
Design captured in `IMPLEMENTATION.md` §Slices/9, the **Colour-scheme extractor**
glossary entry in `CONTEXT.md`, and ADR-0001 (Rust owns the batch decode).

- **`src-tauri/src/analysis.rs`** — the pure, tested core + thin command:
  - `extract_palette(img_path, k)` `#[tauri::command]` — decode → downsample to
    `PALETTE_SAMPLE` (128px) → `palette()` on the blocking pool. `k` clamped
    `3..=8`. Same decode-failure rejection as `compute_histogram` (HEIC/AVIF →
    Inspector "unavailable").
  - `palette(&RgbImage, k) -> Vec<Swatch>` — the pipeline (see Key decisions).
  - Colour maths: `rgb_to_lab` / `lab_to_rgb` (sRGB↔CIELAB D65, round-trips within
    a byte — tested), `salience`, `lab_dist2` (clustering), `merge_dist2`
    (hue-aware merge), `weighted_mean`, `seed_centroids`, `merge_clusters`.
  - `Swatch { hex, r, g, b, weight }` (`#[derive(Serialize, Debug)]`) maps
    field-for-field to the TS `Swatch` already in `types.ts`.
- **`src-tauri/src/lib.rs`** — registered `analysis::extract_palette`.
- **`src/lib/ipc.ts`** — `extractPalette(path, k)`; `getPaletteK` / `setPaletteK`
  over the existing `get_setting`/`set_setting` (key `prefs.paletteK`).
- **`src/lib/stores/settings.ts`** — `paletteK` store + `asPaletteK` coercion +
  `PALETTE_K_MIN`/`PALETTE_K_MAX`/`DEFAULT_PALETTE_K` (3 / 8 / 5).
- **`src/App.svelte`** — hydrates `paletteK` on startup, and **re-persists a
  coerced value** when the stored one is out-of-range/fractional (self-heal).
- **`src/lib/components/Inspector.svelte`** — a **second compute `$effect`** for
  the palette, keyed on `image.path` **and** `$paletteK`, so a k change re-clusters
  *without* re-running the histogram. Same debounce / `cancelled` flag /
  loading–ready–unavailable shape as the histogram seam. The Palette region header
  carries a **−/+ stepper** (disabled at the 3/8 bounds) that writes `paletteK`.
- **`src/lib/components/PaletteBar.svelte`** (new) — proportional bar, segment
  `flex-grow = weight`; click a segment to copy its hex (brief "copied" flash);
  hover/focus reveals hex/RGB/L (via the shared `luminance`) + % below the bar;
  wide segments show their hex inline (contrast ink by luma). Segments are squared
  (`border-radius: 0`) so only the bar's outer edge rounds, and floored at
  `min-width: 1.25rem` so tiny accents stay clickable. Clears `active`/`copied`
  on `palette` change (it isn't remounted on paging).

## Key decisions (the algorithm — this is the meat)
The naïve "k-means in Lab, weight by pixel count" first cut **failed against real
images** in three escalating ways; each layer fixes one. Read this before touching
`palette()`.

1. **Cluster in CIELAB, not RGB** — swatches split on perceptual difference.
2. **Salience weighting** (`salience` = `1 + CHROMA_BOOST·min(chroma/CHROMA_REF,1)`)
   — vivid pixels count for more than their area, feeding the centroid (accents
   stay vivid, not muddied) and the reported weight (accents read as a visible
   segment, not a sliver). *Fixes palette1/palette2: a small red was muted/missing.*
3. **Greedy farthest-first seeding** (`seed_centroids`, **deterministic, no RNG**)
   — seed 0 = salience-weighted mean; each next = the pixel maximising
   `weight·distance²`. Reliably grabs the most hue-isolated region where
   probability-proportional k-means++ could skip it on a draw. *Fixes
   pallette3/pallette4: the blue lid/necklace only appeared at k≥7.*
4. **Over-segment then hue-aware merge** — k-means runs with `k·PALETTE_OVERSEG`
   (4×) clusters using plain `lab_dist2` (so shades over-segment), then
   `merge_clusters` agglomeratively fuses the closest pairs back to `k` using
   `merge_dist2`. That merge metric splits the Lab gap into ΔL / ΔC / ΔH and folds
   ΔL+ΔC by `SHADE_FOLD` **scaled by saturation** — so two reds (same hue) fuse,
   while neutrals (black/grey/white, ~0 chroma) stay distinct and different hues
   never merge. *Fixes the "two reds on the teapot eat a slot" complaint.*
5. **k persists globally** (`prefs.paletteK`) — the Inspector remounts per
   open/page, so a component-local k reset to 5 every time.

**Tuning knobs** (all in `analysis.rs`, all commented): `CHROMA_BOOST` 3.0,
`CHROMA_REF` 80.0, `SHADE_FOLD` 0.85, `PALETTE_OVERSEG` 4, `PALETTE_SAMPLE` 128,
`KMEANS_MAX_ITERS` 32.

## Gotchas worth knowing
- **`weight` is a salience-weighted share, not pixel area.** A 90%-grey/10%-red
  image reports the red at ~31%. Intended (it's what makes accents legible), but
  the UI shows a bare "%" — don't read it as area. *(Code-review finding, left
  as-is by design.)*
- **The tuning constants are mutually-tuned against `screenshots/palette*.png`**,
  which aren't in the repo. The Rust tests assert *loose* inequalities (red
  > 0.25, reds == 1, blue present), so re-tuning one constant can silently shift
  another real image while tests stay green. Re-eyeball the four references after
  any constant change.
- **Decode happens twice per page** (histogram + palette each `image::open`) and
  **again on every k change**. Fine at ~1080p; if large-file perf ever bites,
  cache the decoded/downsampled pixels (or Lab points) by path so a k change is
  pure re-clustering. *(Deferred efficiency findings.)*
- **The two Inspector compute `$effect`s are near-duplicates.** Slices 12/13
  (vectorscope/waveform) will copy the debounce/cancel/state-machine a 3rd/4th
  time — factor a `createComputeSeam(deps, fn, setResult, setStatus)` helper when
  the third lands rather than now. *(Deferred simplification.)*
- **min-width floor vs proportionality:** at k=8 with skewed weights the floored
  slivers make widths only *approximately* proportional; the exact share is in the
  hover readout. Deliberate (small accents must stay clickable).
- **k-range `3..=8` lives in two places** — the Rust `clamp` literal and the TS
  `PALETTE_K_MIN`/`MAX`. Cross-language, can't share; change both together.

## Manual verification checklist (Done-when from the plan)
1. Open an image, open the Inspector (⌘I) → a proportional palette bar renders;
   widths read as each colour's share.
2. The palette **reads true to the image** — dominant colours present, and a
   small but vivid accent (a coloured object on a neutral scene) shows as its own
   visible swatch in its real hue, not a muddy average or a missing colour.
3. Click a segment → its hex lands on the clipboard ("copied" flash); hover →
   hex/RGB/L/% readout below the bar.
4. Step k with −/+ → the palette recomputes (histogram untouched); buttons disable
   at 3 and 8. The choice **survives paging, closing the Viewer, and relaunch**.
5. Open a HEIC/AVIF → palette shows the "unavailable" state; the eyedropper readout
   above still works.

## How to run
- Dev: `npm run tauri dev` (Rust on PATH via `~/.cargo/env`). **Rust changes need a
  dev-server restart** to take effect.
- Frontend: `npm test`, `npm run check`, `npm run build`. Backend: `cargo test`
  (in `src-tauri/`).

## Workflow note
Same as prior slices: review with `/code-review`; merge to `main` with `--no-ff`
and delete the branch. This slice is **already merged**.

## Next: Slice 10 — Polish, or the analysis siblings (12/13)
`IMPLEMENTATION.md` §Slices/10 is the numbered next: cover pinning (`set_cover`,
ADR-0002), photographer search, reveal-in-Finder, ⌘R refresh. But **Slices 12
(Vectorscope) and 13 (Waveform)** are the direct siblings of this analysis block —
both reuse the **Rust-batch-decode + Inspector compute-seam** pattern Slices 8/9
established (a new `compute_*` command, a `Foo.svelte` canvas, a region joined to
the Inspector's compute `$effect` with the same loading/ready/unavailable states).
When the third such tool lands, that's the moment to extract the shared compute-seam
helper noted above. The `reading` store (Slice 7) also gains an `x` field for the
waveform's hover column — see §Slices/13.
