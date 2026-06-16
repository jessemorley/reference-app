//! Thumbnail cache: downscale Reference images to grid size and cache them on
//! disk so the grid renders small renditions instead of decoding full-res files
//! per tile. Rust owns this (ADR-0001): decoding runs off the UI thread.
//!
//! The cache is keyed by *content identity* — a hash of the source path, its
//! mtime, and its size. Replacing a file on disk changes mtime/size, so the key
//! (and thus the cached filename) changes and a fresh thumbnail is generated;
//! the stale one is simply orphaned. As with `scan.rs`, the cache logic lives in
//! free functions (`cache_key`, `ensure_thumb_in`, `generate_thumb`) so it can
//! be unit-tested against temp dirs; the `#[tauri::command]` is thin glue.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::Manager;

/// Longest-edge size, in pixels, of a generated thumbnail. Grid covers render at
/// ~200–300 CSS px and up to 2× on Retina, so 600 keeps them crisp without
/// caching anything near full resolution. Thumbnails only ever downscale —
/// sources already smaller than this are cached at their original size.
const THUMB_MAX: u32 = 600;

/// Distinguishes concurrently-written temp files so two threads generating
/// different thumbnails never collide on the same scratch path.
static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Stable cache key for a source image: a hash of its path, mtime, and size.
/// Not cryptographic — collisions only cost a regenerated thumbnail, and a
/// changed mtime/size deliberately yields a new key so edits invalidate the
/// cache. SipHash's cross-version instability is harmless here for the same
/// reason: a key change just regenerates.
fn cache_key(path: &Path, mtime_nanos: u128, size: u64) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    mtime_nanos.hash(&mut hasher);
    size.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Source file's (mtime-in-nanos, size) — the volatile half of the cache key.
/// A missing mtime (clock-before-epoch, or a platform without mtime) collapses
/// to 0: such files key on path+size alone, which is still stable.
fn file_identity(path: &Path) -> std::io::Result<(u128, u64)> {
    let meta = std::fs::metadata(path)?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Ok((mtime, meta.len()))
}

/// Absolute path where the thumbnail for `key` is cached inside `cache_dir`.
fn thumb_path(cache_dir: &Path, key: &str) -> PathBuf {
    cache_dir.join(format!("{key}.jpg"))
}

/// Ensure a thumbnail for `src` exists in `cache_dir`, generating it on a cache
/// miss, and return the thumbnail's absolute path. A hit (the keyed file already
/// exists) returns immediately without re-decoding the source.
fn ensure_thumb_in(src: &Path, cache_dir: &Path) -> Result<PathBuf, String> {
    let (mtime, size) = file_identity(src).map_err(|e| format!("{}: {e}", src.display()))?;
    let out = thumb_path(cache_dir, &cache_key(src, mtime, size));
    if out.exists() {
        return Ok(out);
    }
    std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    generate_thumb(src, &out)?;
    Ok(out)
}

/// Decode `src`, downscale it to fit `THUMB_MAX` (preserving aspect; never
/// upscaling), and write a JPEG to `out`. The encode goes to a unique temp file
/// that is then renamed into place, so a concurrent reader (the webview loading
/// the thumb) never observes a half-written file.
fn generate_thumb(src: &Path, out: &Path) -> Result<(), String> {
    let img = image::open(src).map_err(|e| format!("decode {}: {e}", src.display()))?;

    // `thumbnail` would upscale a small source up to the bounds; only downscale.
    let thumb = if img.width() <= THUMB_MAX && img.height() <= THUMB_MAX {
        img.to_rgb8()
    } else {
        img.thumbnail(THUMB_MAX, THUMB_MAX).to_rgb8()
    };

    let tmp = out.with_extension(format!(
        "{}.{}.tmp",
        std::process::id(),
        TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    thumb
        .save_with_format(&tmp, image::ImageFormat::Jpeg)
        .map_err(|e| format!("encode {}: {e}", out.display()))?;
    std::fs::rename(&tmp, out).map_err(|e| {
        let _ = std::fs::remove_file(&tmp); // don't leak the scratch file on failure
        e.to_string()
    })
}

/// Directory holding the on-disk thumbnail cache, under the app's cache dir.
/// `lib.rs` grants this to the asset-protocol scope so the webview can load the
/// generated thumbnails.
pub fn thumb_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|d| d.join("thumbnails"))
        .map_err(|e| e.to_string())
}

/// Return the cached thumbnail for `img_path` as an absolute path, generating it
/// on first request. Decoding/encoding is blocking, so it runs on the blocking
/// pool (see agent memory: blocking work in a command stalls the UI). The grid
/// calls this once per visible tile, so requests fan out and run concurrently.
#[tauri::command]
pub async fn ensure_thumb(app: tauri::AppHandle, img_path: String) -> Result<String, String> {
    let cache_dir = thumb_cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        ensure_thumb_in(Path::new(&img_path), &cache_dir)
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};
    use std::path::Path;
    use tempfile::tempdir;

    /// Write a solid-colour PNG of the given size to `path`.
    fn write_png(path: &Path, w: u32, h: u32) {
        let img = RgbImage::from_pixel(w, h, Rgb([120, 80, 40]));
        img.save(path).unwrap();
    }

    #[test]
    fn cache_key_changes_with_mtime_and_size() {
        let p = Path::new("/photos/a.jpg");
        let base = cache_key(p, 1000, 50);
        assert_eq!(base, cache_key(p, 1000, 50), "same inputs ⇒ same key");
        assert_ne!(base, cache_key(p, 2000, 50), "newer mtime ⇒ new key");
        assert_ne!(base, cache_key(p, 1000, 99), "different size ⇒ new key");
        assert_ne!(
            base,
            cache_key(Path::new("/photos/b.jpg"), 1000, 50),
            "different path ⇒ new key"
        );
    }

    #[test]
    fn generates_a_downscaled_thumbnail() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("big.png");
        write_png(&src, 1200, 1500); // larger than THUMB_MAX on both edges
        let cache = dir.path().join("cache");

        let out = ensure_thumb_in(&src, &cache).unwrap();
        assert!(out.exists());

        let thumb = image::open(&out).unwrap();
        assert!(thumb.width() <= THUMB_MAX && thumb.height() <= THUMB_MAX);
        // Aspect preserved: 1200x1500 (4:5) fits 600 ⇒ 480x600.
        assert_eq!((thumb.width(), thumb.height()), (480, 600));
    }

    #[test]
    fn does_not_upscale_a_small_source() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("small.png");
        write_png(&src, 100, 80);
        let cache = dir.path().join("cache");

        let out = ensure_thumb_in(&src, &cache).unwrap();
        let thumb = image::open(&out).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (100, 80));
    }

    #[test]
    fn second_call_is_a_cache_hit_and_does_not_regenerate() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.png");
        write_png(&src, 800, 800);
        let cache = dir.path().join("cache");

        let out = ensure_thumb_in(&src, &cache).unwrap();
        // Overwrite the cached thumb with a sentinel; a hit must leave it alone.
        std::fs::write(&out, b"SENTINEL").unwrap();

        let again = ensure_thumb_in(&src, &cache).unwrap();
        assert_eq!(again, out);
        assert_eq!(std::fs::read(&out).unwrap(), b"SENTINEL", "not regenerated");
    }

    #[test]
    fn regenerates_when_the_source_changes() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.png");
        write_png(&src, 800, 800);
        let cache = dir.path().join("cache");

        let first = ensure_thumb_in(&src, &cache).unwrap();

        // Replace the file with different dimensions ⇒ different size ⇒ new key,
        // independent of mtime resolution.
        write_png(&src, 640, 400);
        let second = ensure_thumb_in(&src, &cache).unwrap();

        assert_ne!(first, second, "changed source ⇒ new cache key");
        assert!(second.exists());
    }

    #[test]
    fn errors_on_a_non_image_source() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("notanimage.jpg");
        std::fs::write(&src, b"this is not a JPEG").unwrap();
        let cache = dir.path().join("cache");

        assert!(ensure_thumb_in(&src, &cache).is_err());
    }
}
