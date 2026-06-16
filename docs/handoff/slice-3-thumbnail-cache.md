# Handoff: Slice 3 — Thumbnail cache

## Where things stand
Slices 1 (skeleton) and 2 (photographer grid) are **merged to `main`**. Slice 3
(thumbnail cache) is **built on branch `slice-3-thumbnail-cache`**, all tests
green, not yet reviewed/merged.

- Rust: `cargo test` → 17 passing (10 `scan`, 6 `thumbs`, +1). `cargo check` clean.
- Frontend: `npm test` → 12 passing. `npm run check` → 0 errors. `npm run build` clean.
- **Not yet manually verified in the running app** — GUI can't be driven
  headlessly here. The user should `npm run tauri dev`, pick a folder, and
  confirm covers fill in progressively and re-opening is instant (see below).

## What Slice 3 added
Defined in `IMPLEMENTATION.md` §Slices/3.

- **`src-tauri/src/thumbs.rs`** — the cache. Key facts not to re-derive:
  - Cache key = `hash(path + mtime + size)` (`DefaultHasher`/SipHash). mtime+size
    change on edit ⇒ new key ⇒ new thumb; stale one is orphaned. Non-crypto by
    design — a collision or cross-version hash drift just regenerates.
  - Thumbnails are JPEG, longest edge `THUMB_MAX = 600`, **downscale only**
    (small sources cached at original size). Encoded to a unique temp file then
    `rename`d into place, so the webview never loads a half-written thumb.
  - `ensure_thumb(imgPath) -> String` (absolute thumb path) runs the
    decode/encode on the blocking pool. Cache dir = `app_cache_dir/thumbnails`.
  - Logic is in free fns (`cache_key`, `ensure_thumb_in`, `generate_thumb`)
    tested against temp dirs; the command is thin glue (the project's testing rule).
- **`lib.rs`** — registers `thumbs::ensure_thumb`; `setup` creates the thumbnail
  cache dir and grants it to the asset-protocol scope (so the webview can load
  thumbs, same mechanism as the Root grant).
- **Frontend** — new `ensureThumb(path)` in `ipc.ts` (invokes + `convertFileSrc`).
  New reusable **`Thumb.svelte`**: takes a `path`, shows a placeholder until
  `ensureThumb` resolves, then swaps in the `<img>`; failures (e.g. HEIC) keep
  the placeholder. The grid renders `<Thumb>` per tile, so covers fill in
  progressively and requests fan out concurrently across the blocking pool.
- **Type change**: `Photographer.coverThumb` (thumb URL) → **`coverPath`**
  (absolute cover path); the tile derives the thumb. `types.ts`,
  `ipc.ts`, the grid, its test, and the `IMPLEMENTATION.md` IPC contract all updated.

### Gotcha worth knowing
The `image` crate **does not decode HEIC/HEIF** (and AVIF only with extra
features we didn't add). `scan.rs` still *lists* those extensions, so a
photographer whose cover is a `.heic` gets a placeholder, not a thumbnail.
Same limitation will bite the Slice 5 viewer (full-res) and the Rust
histogram/palette (8–9). Adding HEIC support means `libheif` (out of scope for v1).

## Manual verification checklist (Done-when from the plan)
1. Pick a folder with many photographers → grid skeleton shows immediately,
   covers pop in as thumbs generate (progressive). Scrolling is smooth.
2. Quit and relaunch (or change folder back) → covers appear instantly (cache hit).
3. Replace a cover file on disk (different content) → its thumb regenerates
   (mtime/size change ⇒ new key). May need a re-scan/relaunch to re-request.

## How to run
- Dev: `npm run tauri dev` (Rust on PATH via `~/.cargo/env`).
- Frontend: `npm test`, `npm run check`, `npm run build`.
- Rust only: `cd src-tauri && cargo test` / `cargo check`.

## Workflow note
Same as prior slices: review with `/code-review`, then merge to `main` with
`--no-ff` and delete the branch.

## Next: Slice 4 — Photographer view
`list_images(photographerRelPath)` one level deep; flattened image grid + Category
tabs. The per-image grid will reuse **`Thumb.svelte`** (point it at each
`RefImage.path`). See `IMPLEMENTATION.md` §Slices/4.
