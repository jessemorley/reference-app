//! Photography Root scanning: enumerate Photographers and their cover image.
//!
//! The folder-walking *rules* live in free functions (`is_image`, `find_cover`,
//! `scan_photographers`) so they can be unit-tested against temp directories;
//! the `#[tauri::command]` at the bottom is thin glue. Per IMPLEMENTATION.md
//! §Testing, the tests target the logic, not the command.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// One tile in the root grid. Mirrors the TS `Photographer`, except `cover`
/// carries the cover image's **absolute path**: turning that into an
/// asset-protocol URL is a frontend concern (`convertFileSrc`), so `ipc.ts`
/// maps `cover` → `coverThumb` on the way through. Cover is full-res for now;
/// real thumbnails arrive in Slice 3.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Photographer {
    pub name: String,
    /// Path relative to the Photography Root — the pin key (ADR-0002).
    pub rel_path: String,
    /// Absolute path of the cover image. `None` only if the folder somehow has
    /// no readable image (such folders are skipped before reaching here).
    pub cover: Option<String>,
}

/// Image file extensions we surface as Reference images (matched
/// case-insensitively).
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "tif", "tiff", "bmp", "heic", "heif", "avif",
];

/// Whether `path`'s extension marks it as a Reference image.
fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

/// Sort key for cover selection: lowercased file name, then full path.
fn cover_key(path: &Path) -> (String, &Path) {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    (name, path)
}

/// The cover image for the tree rooted at `dir`: the image whose file name
/// sorts first (case-insensitive), full path as a stable tiebreak. `None` when
/// the tree holds no Reference image — which is also how `scan_photographers`
/// detects (and skips) an image-less folder.
///
/// Walks in a single pass tracking only the running minimum (no Vec of every
/// path). Two deliberate exclusions:
/// - **Hidden entries** (name starts with `.`) are skipped, which drops macOS
///   AppleDouble sidecars (`._photo.jpg`) — otherwise they'd sort before real
///   images and be picked as the cover — and dot-directories like `.git`.
/// - **Directory symlinks are not descended** (`file_type()` reports the link
///   itself, not its target), so a symlink cycle can't cause unbounded
///   recursion. Symlinked *files* are still eligible.
fn find_cover(dir: &Path) -> Option<PathBuf> {
    let mut best: Option<PathBuf> = None;
    find_cover_into(dir, &mut best);
    best
}

fn find_cover_into(dir: &Path, best: &mut Option<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue; // hidden entry / AppleDouble sidecar
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() {
            // is_dir() is false for a symlink-to-dir, so cycles aren't followed.
            find_cover_into(&path, best);
        } else if is_image(&path) {
            if best
                .as_deref()
                .map_or(true, |current| cover_key(&path) < cover_key(current))
            {
                *best = Some(path);
            }
        }
    }
}

/// Enumerate the Photographers directly inside `root`: each immediate
/// subdirectory holding at least one Reference image, counted recursively so a
/// Photographer with images only inside Categories still counts. Result is
/// sorted by name (case-insensitive). Loose files in `root`, hidden
/// directories, and image-less subfolders are ignored.
pub fn scan_photographers(root: &Path) -> Vec<Photographer> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };

    let mut photographers: Vec<Photographer> = entries
        .flatten()
        .filter_map(|entry| {
            // Real directory (not a file, not a symlink-to-dir) and not hidden.
            if !entry.file_type().ok()?.is_dir() {
                return None;
            }
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();
            if name.starts_with('.') {
                return None;
            }
            let dir = entry.path();
            let cover = find_cover(&dir)?; // no image in the tree ⇒ skip
            let rel_path = dir.strip_prefix(root).ok()?.to_string_lossy().into_owned();
            Some(Photographer {
                name: name.into_owned(),
                rel_path,
                cover: Some(cover.to_string_lossy().into_owned()),
            })
        })
        .collect();

    photographers.sort_by_key(|p| p.name.to_lowercase());
    photographers
}

/// List the Photographers under `root` for the grid. The recursive directory
/// walk is blocking, so it runs on the blocking pool via `spawn_blocking`
/// rather than tying up an async worker (see agent memory: blocking work in a
/// command stalls the UI).
#[tauri::command]
pub async fn list_photographers(root: String) -> Vec<Photographer> {
    tauri::async_runtime::spawn_blocking(move || scan_photographers(Path::new(&root)))
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    /// Create an empty file at `path`, making parent dirs as needed.
    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"").unwrap();
    }

    fn names(root: &Path) -> Vec<String> {
        scan_photographers(root).into_iter().map(|p| p.name).collect()
    }

    #[test]
    fn is_image_matches_known_extensions_case_insensitively() {
        assert!(is_image(Path::new("a.JPG")));
        assert!(is_image(Path::new("a.png")));
        assert!(is_image(Path::new("a.HEIC")));
        assert!(!is_image(Path::new("a.txt")));
        assert!(!is_image(Path::new("noext")));
    }

    #[test]
    fn skips_subdirs_with_no_images() {
        let root = tempdir().unwrap();
        fs::create_dir(root.path().join("Empty")).unwrap();
        touch(&root.path().join("NotPhotos/readme.txt"));
        touch(&root.path().join("Ansel/a.jpg"));

        assert_eq!(names(root.path()), vec!["Ansel"]);
    }

    #[test]
    fn counts_images_nested_inside_categories() {
        let root = tempdir().unwrap();
        // Images live only inside a Category subfolder — still a Photographer.
        touch(&root.path().join("Vivian/portraits/p1.jpg"));

        let ps = scan_photographers(root.path());
        assert_eq!(ps.len(), 1);
        assert_eq!(ps[0].name, "Vivian");
        assert!(ps[0].cover.as_deref().unwrap().ends_with("p1.jpg"));
    }

    #[test]
    fn cover_is_first_image_alphabetically_across_the_tree() {
        let root = tempdir().unwrap();
        // Loose "b.jpg" vs a Category image "a.jpg": "a" wins by name.
        touch(&root.path().join("Saul/b.jpg"));
        touch(&root.path().join("Saul/street/a.jpg"));

        let ps = scan_photographers(root.path());
        assert!(ps[0].cover.as_deref().unwrap().ends_with("a.jpg"));
    }

    #[test]
    fn ignores_loose_files_in_root_and_sorts_by_name() {
        let root = tempdir().unwrap();
        touch(&root.path().join("loose.jpg")); // directly in root → ignored
        touch(&root.path().join("Zed/z.jpg"));
        touch(&root.path().join("Abe/a.jpg"));

        assert_eq!(names(root.path()), vec!["Abe", "Zed"]);
    }

    #[test]
    fn rel_path_is_relative_to_root() {
        let root = tempdir().unwrap();
        touch(&root.path().join("Ansel/a.jpg"));

        assert_eq!(scan_photographers(root.path())[0].rel_path, "Ansel");
    }

    #[test]
    fn missing_root_yields_empty_list() {
        assert!(scan_photographers(Path::new("/no/such/path/here")).is_empty());
    }

    #[test]
    fn appledouble_sidecar_is_not_chosen_as_cover() {
        let root = tempdir().unwrap();
        // "._real.jpg" sorts before "real.jpg" but is a hidden sidecar.
        touch(&root.path().join("Ansel/._real.jpg"));
        touch(&root.path().join("Ansel/real.jpg"));

        let ps = scan_photographers(root.path());
        assert!(ps[0].cover.as_deref().unwrap().ends_with("real.jpg"));
    }

    #[test]
    fn folder_with_only_hidden_images_is_skipped() {
        let root = tempdir().unwrap();
        touch(&root.path().join("Ghost/._only.jpg")); // sidecar, no real image
        touch(&root.path().join("Ansel/a.jpg"));

        assert_eq!(names(root.path()), vec!["Ansel"]);
    }

    #[test]
    fn hidden_top_level_dirs_are_skipped() {
        let root = tempdir().unwrap();
        touch(&root.path().join(".git/a.jpg"));
        touch(&root.path().join("Ansel/a.jpg"));

        assert_eq!(names(root.path()), vec!["Ansel"]);
    }

    #[cfg(unix)]
    #[test]
    fn directory_symlink_cycles_do_not_recurse_forever() {
        use std::os::unix::fs::symlink;
        let root = tempdir().unwrap();
        touch(&root.path().join("Ansel/a.jpg"));
        // A symlink back to the photographer dir would loop if followed.
        symlink(root.path().join("Ansel"), root.path().join("Ansel/loop")).unwrap();

        let ps = scan_photographers(root.path());
        assert_eq!(ps.len(), 1);
        assert!(ps[0].cover.as_deref().unwrap().ends_with("a.jpg"));
    }
}
