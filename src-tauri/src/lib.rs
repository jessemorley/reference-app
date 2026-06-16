use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

/// Key under which the Photography Root path is persisted, and the store file
/// that holds it (and, in later slices, cover pins — see ADR-0002).
const STORE_FILE: &str = "settings.json";
const ROOT_KEY: &str = "root";

/// Open a native folder picker; on selection, persist the chosen Photography
/// Root and return its absolute path. Returns `None` if the user cancels.
#[tauri::command]
fn select_root(app: tauri::AppHandle) -> Option<String> {
    let picked = app.dialog().file().blocking_pick_folder()?;
    let path = picked.into_path().ok()?.to_string_lossy().to_string();

    let store = app.store(STORE_FILE).ok()?;
    store.set(ROOT_KEY, serde_json::Value::String(path.clone()));
    let _ = store.save();

    Some(path)
}

/// Return the persisted Photography Root, or `None` on first run.
#[tauri::command]
fn get_root(app: tauri::AppHandle) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store
        .get(ROOT_KEY)
        .and_then(|v| v.as_str().map(str::to_string))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![select_root, get_root])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
