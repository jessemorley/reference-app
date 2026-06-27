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
    /// Whether `cover` came from a user pin (vs. the alphabetical default). The
    /// tile right-click menu reads this to show "Reset to default" vs "Current
    /// cover" (Slice 10). Always `false` out of `scan_photographers`; the
    /// `list_photographers` command flips it when it applies a pin.
    pub pinned: bool,
    /// Instagram handle (without `@`), from `.refapp.json` in the folder. `None`
    /// when the file is absent or the field is missing/empty.
    pub instagram: Option<String>,
    /// Short bio blurb, from `.refapp.json`. `None` when absent or empty.
    pub blurb: Option<String>,
    /// Website URL, from `.refapp.json`. `None` when absent or empty.
    pub website: Option<String>,
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

/// Read `instagram` + `blurb` from `.refapp.json` inside `dir`.
/// Missing file, missing keys, or empty strings all return `None` — no info is
/// treated identically to no file, so the rest of the app has a single code path.
fn read_photographer_info(dir: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let Ok(text) = std::fs::read_to_string(dir.join(".refapp.json")) else {
        return (None, None, None);
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) else {
        return (None, None, None);
    };
    let get = |key: &str| {
        val.get(key)
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    (get("instagram"), get("blurb"), get("website"))
}

/// Write `instagram` + `blurb` to `.refapp.json` inside the photographer's folder.
/// Called from the `set_photographer_info` command; runs on the blocking pool since
/// it writes to disk (same rationale as `list_photographers`).
#[tauri::command]
pub async fn set_photographer_info(
    root: String,
    rel_path: String,
    instagram: Option<String>,
    blurb: Option<String>,
    website: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&root).join(&rel_path).join(".refapp.json");
        let val = serde_json::json!({ "instagram": instagram, "blurb": blurb, "website": website });
        std::fs::write(path, serde_json::to_string_pretty(&val).unwrap())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
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
            let (instagram, blurb, website) = read_photographer_info(&dir);
            Some(Photographer {
                name: name.into_owned(),
                rel_path,
                cover: Some(cover.to_string_lossy().into_owned()),
                pinned: false,
                instagram,
                blurb,
                website,
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
///
/// Cover pins (ADR-0002) are resolved here — the only place "what is the cover"
/// is decided: a pinned image still on disk wins, otherwise the alphabetical
/// default `scan_photographers` found. Pins are read off the central store
/// before the blocking walk (so `app` isn't moved into the closure).
#[tauri::command]
pub async fn list_photographers(app: tauri::AppHandle, root: String) -> Vec<Photographer> {
    let pins = read_cover_pins(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let mut photographers = scan_photographers(Path::new(&root));
        for p in &mut photographers {
            if let Some(pinned) = pins.get(&p.rel_path) {
                // A pin whose image was deleted/moved falls back to the default.
                if Path::new(pinned).is_file() {
                    p.cover = Some(pinned.clone());
                    p.pinned = true;
                }
            }
        }
        photographers
    })
    .await
    .unwrap_or_default()
}

/// The `relPath -> absolute cover path` pin map from the central store, empty if
/// unset or malformed.
fn read_cover_pins(app: &tauri::AppHandle) -> std::collections::HashMap<String, String> {
    use tauri_plugin_store::StoreExt;
    app.store(crate::STORE_FILE)
        .ok()
        .and_then(|s| s.get(crate::COVERS_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// A Category tab in the photographer view. Mirrors the TS `Category`. The
/// synthetic "All"/"Uncategorised" tabs are built on the frontend; this list
/// only carries the *real* Categories (subfolders that hold ≥1 image).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub name: String,
    pub count: usize,
}

/// One Reference image in the photographer view. Mirrors the TS `RefImage`.
/// `path` is absolute (for the asset-protocol full-res load and on-demand
/// thumbnailing via `ensure_thumb`); `category` is the owning Category's name,
/// or `None` for a loose image directly in the Photographer folder.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefImage {
    pub name: String,
    pub path: String,
    pub category: Option<String>,
    /// Owning Photographer's display name. `None` in the per-photographer view
    /// (`scan_images`); set by `scan_all_images` for the all-images root grid.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub photographer: Option<String>,
    /// Owning Photographer's path relative to the Root (the click-through key).
    /// `None` / set on the same terms as `photographer`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub photographer_rel_path: Option<String>,
}

/// The payload for one Photographer: the flattened image list plus the Category
/// tabs. Mirrors the `{ categories, images }` shape in the IPC contract.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotographerImages {
    pub categories: Vec<Category>,
    pub images: Vec<RefImage>,
}

/// File name for sorting/display, lossily decoded. Empty when the path has no
/// final component (shouldn't happen for real entries).
fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Collect the visible (non-hidden) image files directly inside `dir`, one
/// level only — Categories do not nest (CONTEXT.md), so a Category's images are
/// its immediate image children. Directory symlinks are irrelevant here since
/// we never descend; hidden entries (incl. AppleDouble sidecars) are skipped.
fn immediate_images(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_image(p))
        .collect()
}

/// Walk a Photographer folder one level deep and flatten it into the view
/// payload. Loose images (directly in `dir`) get `category: None`; images inside
/// an immediate subfolder get that subfolder's name as their Category. Empty
/// subfolders — and subfolders with no images — are not Categories.
///
/// Images are sorted by (Category, name), case-insensitive, with loose images
/// first; the frontend's "All" tab shows them in this order and per-Category
/// tabs just filter it. Categories are sorted by name, case-insensitive.
pub fn scan_images(dir: &Path) -> PhotographerImages {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return PhotographerImages::default();
    };

    let mut images: Vec<RefImage> = Vec::new();
    let mut categories: Vec<Category> = Vec::new();

    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue; // hidden entry / AppleDouble sidecar
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() {
            // is_dir() (via file_type) is false for a symlink-to-dir, matching
            // scan_photographers: only real subfolders are Categories.
            let name = file_name(&path);
            let mut cat_images = immediate_images(&path);
            if cat_images.is_empty() {
                continue; // not a Category — no images to surface
            }
            categories.push(Category {
                name: name.clone(),
                count: cat_images.len(),
            });
            cat_images.sort_by_key(|p| file_name(p).to_lowercase());
            for p in cat_images {
                images.push(RefImage {
                    name: file_name(&p),
                    path: p.to_string_lossy().into_owned(),
                    category: Some(name.clone()),
                    photographer: None,
                    photographer_rel_path: None,
                });
            }
        } else if is_image(&path) {
            images.push(RefImage {
                name: file_name(&path),
                path: path.to_string_lossy().into_owned(),
                category: None,
                photographer: None,
                photographer_rel_path: None,
            });
        }
    }

    categories.sort_by_key(|c| c.name.to_lowercase());
    // Loose first (None sorts before Some), then by Category, then by name —
    // a stable, predictable order for the flattened "All" grid.
    images.sort_by_key(|i| {
        (
            i.category.as_ref().map(|c| c.to_lowercase()),
            i.name.to_lowercase(),
        )
    });

    PhotographerImages { categories, images }
}

/// List one Photographer's images for the photographer view. `rel_path` is the
/// Photographer's path relative to `root` (the pin key — ADR-0002); they're
/// joined here so the frontend never handles absolute paths. Blocking walk, so
/// it runs on the blocking pool (same rationale as `list_photographers`).
#[tauri::command]
pub async fn list_images(root: String, rel_path: String) -> PhotographerImages {
    tauri::async_runtime::spawn_blocking(move || scan_images(&Path::new(&root).join(&rel_path)))
        .await
        .unwrap_or_default()
}

/// Every image across all Photographers, flattened into one grid with Categories
/// merged by name. Runs `scan_images` per Photographer folder (the same
/// non-hidden immediate subdirs `scan_photographers` recognises — but without the
/// recursive cover walk, which the all-images grid doesn't need) and merges the
/// results: same-named Categories across Photographers collapse into one tab with
/// summed counts, and every image is tagged with its Photographer's name +
/// rel_path for the tile overlay / click-through.
///
/// Images are ordered by (photographer, category, name) so each Photographer's
/// tiles cluster; Categories sorted case-insensitively by name.
pub fn scan_all_images(root: &Path) -> PhotographerImages {
    let Ok(entries) = std::fs::read_dir(root) else {
        return PhotographerImages::default();
    };

    let mut counts: std::collections::HashMap<String, (String, usize)> =
        std::collections::HashMap::new();
    let mut images: Vec<RefImage> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue; // hidden entry
        }
        // Real directory only (file_type is false for symlink-to-dir), matching
        // scan_photographers.
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let dir = entry.path();
        let rel_path = match dir.strip_prefix(root) {
            Ok(p) => p.to_string_lossy().into_owned(),
            Err(_) => continue,
        };
        let pi = scan_images(&dir);
        for c in pi.categories {
            // Merge by case-insensitive name; keep the first-seen casing for the label.
            let entry = counts
                .entry(c.name.to_lowercase())
                .or_insert((c.name.clone(), 0));
            entry.1 += c.count;
        }
        for mut img in pi.images {
            img.photographer = Some(name.clone());
            img.photographer_rel_path = Some(rel_path.clone());
            images.push(img);
        }
    }

    let mut categories: Vec<Category> = counts
        .into_values()
        .map(|(name, count)| Category { name, count })
        .collect();
    categories.sort_by_key(|c| c.name.to_lowercase());

    images.sort_by(|a, b| {
        let key = |i: &RefImage| {
            (
                i.photographer.as_deref().unwrap_or_default().to_lowercase(),
                i.category.as_deref().map(str::to_lowercase),
                i.name.to_lowercase(),
            )
        };
        key(a).cmp(&key(b))
    });

    PhotographerImages { categories, images }
}

/// List every image under `root` for the all-images root grid. Blocking walk, so
/// it runs on the blocking pool (same rationale as `list_images`).
#[tauri::command]
pub async fn list_all_images(root: String) -> PhotographerImages {
    tauri::async_runtime::spawn_blocking(move || scan_all_images(Path::new(&root)))
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

    // --- scan_images (Slice 4) ---

    fn image_names(dir: &Path) -> Vec<String> {
        scan_images(dir).images.into_iter().map(|i| i.name).collect()
    }

    #[test]
    fn loose_images_have_no_category_and_sort_by_name() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("b.jpg"));
        touch(&dir.path().join("A.png"));

        let out = scan_images(dir.path());
        assert!(out.categories.is_empty());
        assert_eq!(image_names(dir.path()), vec!["A.png", "b.jpg"]);
        assert!(out.images.iter().all(|i| i.category.is_none()));
    }

    #[test]
    fn subfolder_images_take_the_subfolder_as_their_category() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("portraits/p1.jpg"));
        touch(&dir.path().join("portraits/p2.jpg"));

        let out = scan_images(dir.path());
        assert_eq!(out.categories.len(), 1);
        assert_eq!(out.categories[0].name, "portraits");
        assert_eq!(out.categories[0].count, 2);
        assert!(out
            .images
            .iter()
            .all(|i| i.category.as_deref() == Some("portraits")));
    }

    #[test]
    fn categories_are_sorted_and_counted_imageless_subfolders_dropped() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("street/s1.jpg"));
        touch(&dir.path().join("Abstract/a1.jpg"));
        touch(&dir.path().join("Abstract/a2.jpg"));
        std::fs::create_dir_all(dir.path().join("empty")).unwrap(); // no images
        touch(&dir.path().join("notes/readme.txt")); // no images

        let out = scan_images(dir.path());
        let cats: Vec<(&str, usize)> = out
            .categories
            .iter()
            .map(|c| (c.name.as_str(), c.count))
            .collect();
        assert_eq!(cats, vec![("Abstract", 2), ("street", 1)]);
    }

    #[test]
    fn loose_images_sort_before_categorised_ones() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("loose.jpg"));
        touch(&dir.path().join("zzz/z.jpg"));

        // Loose (None) sorts before Some(category), regardless of name.
        assert_eq!(image_names(dir.path()), vec!["loose.jpg", "z.jpg"]);
        let first = &scan_images(dir.path()).images[0];
        assert!(first.category.is_none());
    }

    #[test]
    fn categories_do_not_nest_deeper_images_are_ignored() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("portraits/p1.jpg"));
        // A folder nested two levels deep is not walked (categories are flat).
        touch(&dir.path().join("portraits/2023/deep.jpg"));

        let out = scan_images(dir.path());
        assert_eq!(out.categories[0].count, 1);
        assert_eq!(image_names(dir.path()), vec!["p1.jpg"]);
    }

    #[test]
    fn hidden_entries_are_skipped_in_images_and_categories() {
        let dir = tempdir().unwrap();
        touch(&dir.path().join("._sidecar.jpg")); // loose AppleDouble
        touch(&dir.path().join("real.jpg"));
        touch(&dir.path().join("portraits/._hidden.jpg")); // sidecar in category
        touch(&dir.path().join("portraits/p1.jpg"));
        touch(&dir.path().join(".hidden_cat/x.jpg")); // hidden subfolder

        let out = scan_images(dir.path());
        assert_eq!(image_names(dir.path()), vec!["real.jpg", "p1.jpg"]);
        assert_eq!(out.categories.len(), 1);
        assert_eq!(out.categories[0].name, "portraits");
        assert_eq!(out.categories[0].count, 1);
    }

    #[test]
    fn missing_photographer_dir_yields_empty_payload() {
        let out = scan_images(Path::new("/no/such/photographer"));
        assert!(out.categories.is_empty());
        assert!(out.images.is_empty());
    }

    // --- scan_all_images (all-images root grid) ---

    #[test]
    fn all_images_merges_same_named_categories_across_photographers() {
        let root = tempdir().unwrap();
        touch(&root.path().join("Ansel/portraits/a.jpg"));
        touch(&root.path().join("Vivian/portraits/v.jpg"));
        touch(&root.path().join("Vivian/street/s.jpg"));

        let out = scan_all_images(root.path());
        let cats: Vec<(&str, usize)> = out
            .categories
            .iter()
            .map(|c| (c.name.as_str(), c.count))
            .collect();
        // "portraits" merges to 2; "street" stays 1; sorted by name.
        assert_eq!(cats, vec![("portraits", 2), ("street", 1)]);
        assert_eq!(out.images.len(), 3);
    }

    #[test]
    fn all_images_tag_each_image_with_its_photographer() {
        let root = tempdir().unwrap();
        touch(&root.path().join("Ansel/loose.jpg"));
        touch(&root.path().join("Vivian/street/s.jpg"));

        let out = scan_all_images(root.path());
        for img in &out.images {
            // Every image carries attribution.
            assert!(img.photographer.is_some());
            assert_eq!(
                img.photographer.as_deref(),
                img.photographer_rel_path.as_deref()
            );
        }
        // Clustered by photographer: Ansel's image sorts before Vivian's.
        assert_eq!(out.images[0].photographer.as_deref(), Some("Ansel"));
        assert_eq!(out.images[0].category, None);
        assert_eq!(out.images[1].photographer.as_deref(), Some("Vivian"));
        assert_eq!(out.images[1].category.as_deref(), Some("street"));
    }

    #[test]
    fn all_images_skips_hidden_dirs_and_loose_root_files() {
        let root = tempdir().unwrap();
        touch(&root.path().join("loose_in_root.jpg")); // directly in root → ignored
        touch(&root.path().join(".hidden/h.jpg")); // hidden photographer → ignored
        touch(&root.path().join("Ansel/a.jpg"));

        let out = scan_all_images(root.path());
        assert_eq!(out.images.len(), 1);
        assert_eq!(out.images[0].name, "a.jpg");
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
