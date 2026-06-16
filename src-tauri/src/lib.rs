use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

mod scan;
mod thumbs;

/// Key under which the Photography Root path is persisted, and the store file
/// that holds it (and, in later slices, cover pins — see ADR-0002).
const STORE_FILE: &str = "settings.json";
const ROOT_KEY: &str = "root";

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
            scan::list_photographers,
            thumbs::ensure_thumb
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
