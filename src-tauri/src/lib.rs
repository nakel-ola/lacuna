mod bulk;
mod insights;
mod scanner;
mod view;
mod volumes;

use scanner::{Scanner, Stats, ROOT};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const SCAN_THREADS: usize = 16;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Status {
    Scanning,
    Done,
    Cancelled,
}

struct Session {
    id: u64,
    label: String,
    scanner: Arc<Scanner>,
    status: Status,
    started: Instant,
    finished: Option<Instant>,
    space: Option<volumes::Space>,
}

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
    next_id: Mutex<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Summary {
    scan_id: u64,
    status: Status,
    root: String,
    label: String,
    stats: Stats,
    space: Option<volumes::Space>,
    elapsed_ms: u64,
}

fn summary(s: &Session) -> Summary {
    let tree = s.scanner.tree();
    Summary {
        scan_id: s.id,
        status: s.status,
        root: tree.root_path.to_string_lossy().into_owned(),
        label: s.label.clone(),
        stats: tree.stats.clone(),
        space: s.space,
        elapsed_ms: s.finished.unwrap_or_else(Instant::now).duration_since(s.started).as_millis() as u64,
    }
}

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Option<Session>> {
    state.session.lock().unwrap_or_else(|e| e.into_inner())
}

// ---- Commands --------------------------------------------------------------

#[tauri::command]
fn list_volumes() -> Vec<volumes::Volume> {
    volumes::list()
}

#[tauri::command]
fn current_scan(state: State<'_, AppState>) -> Option<Summary> {
    lock(&state).as_ref().map(summary)
}

#[tauri::command]
fn start_scan(app: AppHandle, state: State<'_, AppState>, path: String, label: Option<String>) -> Result<Summary, String> {
    let root = PathBuf::from(&path);
    let scanner = Arc::new(Scanner::new(&root, false).map_err(|e| format!("Can't scan {path}: {e}"))?);
    let id = {
        let mut next = state.next_id.lock().unwrap();
        *next += 1;
        *next
    };
    let root_name = scanner.tree().root_path.to_string_lossy().into_owned();
    let session = Session {
        id,
        label: label.unwrap_or_else(|| root_name.clone()),
        scanner: scanner.clone(),
        status: Status::Scanning,
        started: Instant::now(),
        finished: None,
        space: volumes::space(&root),
    };
    let first = summary(&session);
    if let Some(old) = lock(&state).replace(session) {
        old.scanner.cancel();
    }

    // Progress ticker.
    let ticker = (app.clone(), scanner.clone());
    std::thread::spawn(move || {
        let (app, scanner) = ticker;
        let _ = &scanner;
        loop {
            std::thread::sleep(PROGRESS_INTERVAL);
            let state = app.state::<AppState>();
            let guard = lock(&state);
            match guard.as_ref() {
                Some(s) if s.id == id && s.status == Status::Scanning => {
                    let _ = app.emit("scan-progress", summary(s));
                }
                _ => break,
            }
        }
    });

    // The scan itself.
    std::thread::spawn(move || {
        scanner.run(SCAN_THREADS);
        let state = app.state::<AppState>();
        let mut guard = lock(&state);
        if let Some(s) = guard.as_mut().filter(|s| s.id == id) {
            s.status = if scanner.is_cancelled() { Status::Cancelled } else { Status::Done };
            s.finished = Some(Instant::now());
            let _ = app.emit("scan-done", summary(s));
        }
    });

    Ok(first)
}

#[tauri::command]
fn cancel_scan(state: State<'_, AppState>) {
    if let Some(s) = lock(&state).as_ref() {
        s.scanner.cancel();
    }
}

#[tauri::command]
fn close_scan(state: State<'_, AppState>) {
    if let Some(s) = lock(&state).take() {
        s.scanner.cancel();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeResponse {
    scan_id: u64,
    path: String,
    ancestors: Vec<Crumb>,
    tree: view::ViewNode,
}

#[derive(Serialize)]
struct Crumb {
    id: u32,
    name: String,
}

#[tauri::command]
async fn get_tree(app: AppHandle, id: Option<u32>, depth: Option<u32>) -> Result<TreeResponse, String> {
    let state = app.state::<AppState>();
    let guard = lock(&state);
    let s = guard.as_ref().ok_or("No scan loaded")?;
    let tree = s.scanner.tree();
    let id = id.unwrap_or(ROOT);
    if !tree.is_attached(id) {
        return Err("Unknown item".into());
    }
    let mut ancestors: Vec<Crumb> = tree.ancestors(id).into_iter().map(|(id, name)| Crumb { id, name }).collect();
    ancestors[0].name = s.label.clone();
    Ok(TreeResponse {
        scan_id: s.id,
        path: tree.path_of(id).to_string_lossy().into_owned(),
        ancestors,
        tree: view::view(&tree, id, depth.unwrap_or(5).min(view::MAX_DEPTH)),
    })
}

/// Runs `f` on the tree of the open scan after checking `id` is still in it.
fn with_node<T>(app: &AppHandle, id: Option<u32>, f: impl FnOnce(&scanner::Tree, u32) -> T) -> Result<T, String> {
    let state = app.state::<AppState>();
    let scanner = lock(&state).as_ref().ok_or("No scan loaded")?.scanner.clone();
    let tree = scanner.tree();
    let id = id.unwrap_or(ROOT);
    if !tree.is_attached(id) {
        return Err("Unknown item".into());
    }
    Ok(f(&tree, id))
}

#[tauri::command]
async fn largest_files(app: AppHandle, id: Option<u32>, limit: Option<usize>) -> Result<Vec<insights::Hit>, String> {
    with_node(&app, id, |tree, id| insights::largest_files(tree, id, limit.unwrap_or(200).min(2000)))
}

#[tauri::command]
async fn type_breakdown(app: AppHandle, id: Option<u32>) -> Result<Vec<insights::TypeTotal>, String> {
    with_node(&app, id, insights::type_breakdown)
}

#[tauri::command]
async fn search_items(app: AppHandle, query: String, limit: Option<usize>) -> Result<Vec<insights::Hit>, String> {
    with_node(&app, None, |tree, id| insights::search(tree, id, query.trim(), limit.unwrap_or(300).min(2000)))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrashItem {
    id: u32,
    path: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrashResult {
    items: Vec<TrashItem>,
    total: u64,
    trashed: Vec<u32>,
    failed: Vec<String>,
}

/// Moves items to the Trash (recoverable). With `dry_run`, only resolves and
/// validates the selection so the UI can show exactly what will be removed.
#[tauri::command]
async fn trash_items(app: AppHandle, scan_id: u64, ids: Vec<u32>, dry_run: bool) -> Result<TrashResult, String> {
    let state = app.state::<AppState>();
    let (scanner, items) = {
        let guard = lock(&state);
        let s = guard.as_ref().filter(|s| s.id == scan_id).ok_or("This scan is no longer open")?;
        if s.status == Status::Scanning {
            return Err("Wait for the scan to finish before deleting".into());
        }
        let tree = s.scanner.tree();
        let selected: HashSet<u32> = ids.iter().copied().collect();
        let mut items = Vec::new();
        for &id in &selected {
            if id == ROOT {
                return Err("Refusing to delete the scanned folder itself".into());
            }
            if !tree.is_attached(id) {
                return Err(format!("Item {id} no longer exists"));
            }
            // Deleting a folder already deletes anything selected inside it.
            if selected.iter().any(|&other| other != id && tree.is_ancestor(other, id)) {
                continue;
            }
            let path = tree.path_of(id);
            if !path.starts_with(&tree.root_path) || path == tree.root_path {
                return Err("Path escapes the scanned folder".into());
            }
            items.push(TrashItem { id, path: path.to_string_lossy().into_owned(), size: tree.nodes[id as usize].size });
        }
        items.sort_by(|a, b| b.size.cmp(&a.size));
        (s.scanner.clone(), items)
    };
    let total = items.iter().map(|i| i.size).sum();
    if dry_run {
        return Ok(TrashResult { items, total, trashed: vec![], failed: vec![] });
    }

    let mut trashed = Vec::new();
    let mut failed = Vec::new();
    let ctx = trash_context();
    for item in &items {
        match ctx.delete(&item.path) {
            Ok(()) => trashed.push(item.id),
            Err(e) => failed.push(format!("{}: {e}", item.path)),
        }
    }
    {
        let mut tree = scanner.tree();
        for &id in &trashed {
            tree.remove(id);
        }
    }
    let mut guard = lock(&state);
    if let Some(s) = guard.as_mut().filter(|s| s.id == scan_id) {
        let root = s.scanner.tree().root_path.clone();
        s.space = volumes::space(&root);
        let _ = app.emit("scan-done", summary(s));
    }
    Ok(TrashResult { items, total, trashed, failed })
}

fn trash_context() -> trash::TrashContext {
    #[allow(unused_mut)]
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        // NSFileManager.trashItem: no Finder automation prompt.
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx
}

#[tauri::command]
fn reveal(state: State<'_, AppState>, id: u32) -> Result<(), String> {
    let path = {
        let guard = lock(&state);
        let s = guard.as_ref().ok_or("No scan loaded")?;
        let tree = s.scanner.tree();
        if !tree.is_attached(id) {
            return Err("Unknown item".into());
        }
        tree.path_of(id)
    };
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn choose_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Choose a folder to scan")
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Opens System Settings → Privacy & Security → Full Disk Access.
#[tauri::command]
fn open_full_disk_access_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn();
}

/// Heuristic: this file is readable only with Full Disk Access.
#[tauri::command]
fn has_full_disk_access() -> bool {
    !cfg!(target_os = "macos") || std::fs::File::open("/Library/Application Support/com.apple.TCC/TCC.db").is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_volumes,
            current_scan,
            start_scan,
            cancel_scan,
            close_scan,
            get_tree,
            largest_files,
            type_breakdown,
            search_items,
            trash_items,
            reveal,
            choose_folder,
            open_full_disk_access_settings,
            has_full_disk_access,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lacuna");
}
