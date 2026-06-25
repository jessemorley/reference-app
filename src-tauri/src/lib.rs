use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

mod analysis;
mod scan;
mod thumbs;

/// Key under which the Photography Root path is persisted, and the store file
/// that holds it (and, in later slices, cover pins — see ADR-0002).
pub(crate) const STORE_FILE: &str = "settings.json";
const ROOT_KEY: &str = "root";
/// Store key for the cover-pin map (`relPath -> absolute image path`), read by
/// `scan::list_photographers` and written by `set_cover` (ADR-0002).
pub(crate) const COVERS_KEY: &str = "covers";

/// Open a native folder picker; on selection, persist the chosen Photography
/// Root and return its absolute path. Returns `None` if the user cancels.
///
/// Must be `async`: synchronous Tauri commands run on the main thread, and
/// `blocking_pick_folder` would then block the very thread the native dialog
/// needs — the picker opens but can't take input. Making it async runs it off
/// the main thread, so the blocking wait happens on a worker thread instead.
#[tauri::command]
async fn select_root(app: tauri::AppHandle) -> Option<String> {
    let picked = app.dialog().file().blocking_pick_folder()?;
    let path = picked.into_path().ok()?.to_string_lossy().to_string();

    let store = app.store(STORE_FILE).ok()?;
    store.set(ROOT_KEY, serde_json::Value::String(path.clone()));
    let _ = store.save();

    allow_root_assets(&app, &path);
    Some(path)
}

/// Return the persisted Photography Root, or `None` on first run.
#[tauri::command]
fn get_root(app: tauri::AppHandle) -> Option<String> {
    read_root(&app)
}

/// Read the persisted Photography Root without going through the command layer,
/// so `setup` can reuse it.
fn read_root(app: &tauri::AppHandle) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store
        .get(ROOT_KEY)
        .and_then(|v| v.as_str().map(str::to_string))
}

/// Read a persisted preference by key, or `None` if unset. Generic key/value
/// glue over the same `settings.json` store: view preferences (tile sizes now,
/// Backdrop / Inspector state in later slices) persist through here rather than
/// the JS store plugin, so `settings.json` keeps a single writer (this Rust
/// side, alongside the Root and — later — cover pins). The frontend wraps these
/// in typed accessors (`ipc.ts`) so callers never touch raw keys.
#[tauri::command]
fn get_setting(app: tauri::AppHandle, key: String) -> Option<serde_json::Value> {
    app.store(STORE_FILE).ok()?.get(&key)
}

/// Persist a preference value under `key`. See `get_setting` for why this lives
/// in Rust rather than the JS store plugin.
#[tauri::command]
fn set_setting(app: tauri::AppHandle, key: String, value: serde_json::Value) {
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(&key, value);
        let _ = store.save();
    }
}

/// Pin (or, with `img_path: None`, un-pin) a Photographer's cover image. Pins
/// live in the central store keyed by the folder's path relative to the Root
/// (ADR-0002); `list_photographers` resolves them, so there's no `get_cover`.
#[tauri::command]
fn set_cover(app: tauri::AppHandle, rel_path: String, img_path: Option<String>) {
    let Ok(store) = app.store(STORE_FILE) else {
        return;
    };
    let mut covers = store
        .get(COVERS_KEY)
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    match img_path {
        Some(path) => {
            covers.insert(rel_path, serde_json::Value::String(path));
        }
        None => {
            covers.remove(&rel_path);
        }
    }
    store.set(COVERS_KEY, serde_json::Value::Object(covers));
    let _ = store.save();
}

/// Reveal a file or folder in Finder (selecting it in its parent). Used by the
/// image-tile menu (the image file) and the photographer-view header (the
/// folder) — Slice 10.
#[tauri::command]
fn reveal_in_finder(path: String) {
    let _ = tauri_plugin_opener::reveal_item_in_dir(path);
}

/// Widen the asset-protocol scope to serve full-res Reference images from
/// anywhere under `root`. The static scope in tauri.conf.json starts empty;
/// the Root is user-chosen at runtime, so we grant it here (on selection, and
/// on startup for the persisted Root).
fn allow_root_assets(app: &tauri::AppHandle, root: &str) {
    let _ = app.asset_protocol_scope().allow_directory(root, true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Grant the persisted Root to the asset scope before the grid loads.
            if let Some(root) = read_root(app.handle()) {
                allow_root_assets(app.handle(), &root);
            }
            // Grant the thumbnail cache dir too, so the webview can load the
            // generated thumbnails (created by Slice 3's ensure_thumb).
            if let Ok(dir) = thumbs::thumb_cache_dir(app.handle()) {
                let _ = std::fs::create_dir_all(&dir);
                let _ = app.asset_protocol_scope().allow_directory(&dir, true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_root,
            get_root,
            get_setting,
            set_setting,
            set_cover,
            reveal_in_finder,
            scan::list_photographers,
            scan::list_images,
            thumbs::ensure_thumb,
            analysis::compute_histogram,
            analysis::extract_palette
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
