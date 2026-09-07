mod pdf_export;
mod web_fetch;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use pdf_export::export_pdf_file;
use web_fetch::http_fetch;
use tauri::{AppHandle, Emitter, Manager};

struct PendingFiles(Mutex<Vec<String>>);

const MAX_DROPPED_DOCUMENTS: usize = 1_000;

fn is_document(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
        .unwrap_or(false)
}

fn collect_documents(path: &Path, documents: &mut Vec<PathBuf>) {
    if documents.len() >= MAX_DROPPED_DOCUMENTS {
        return;
    }

    if path.is_file() {
        if is_document(path) {
            documents.push(path.to_path_buf());
        }
        return;
    }

    if !path.is_dir() {
        return;
    }

    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        if documents.len() >= MAX_DROPPED_DOCUMENTS {
            break;
        }

        let entry_path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() || file_type.is_file() {
            collect_documents(&entry_path, documents);
        }
    }
}

fn expand_document_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut documents = Vec::new();
    for path in paths {
        collect_documents(&path, &mut documents);
    }

    documents.sort_by_cached_key(|path| path.to_string_lossy().to_lowercase());
    documents.dedup();
    documents
}

fn allow_file(app: &AppHandle, path: &Path) {
    use tauri_plugin_fs::FsExt;
    let _ = app.fs_scope().allow_file(path);
    let _ = app.asset_protocol_scope().allow_file(path);
}

fn handle_opened_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let paths: Vec<String> = paths
        .into_iter()
        .map(|path| {
            allow_file(app, &path);
            path.to_string_lossy().into_owned()
        })
        .collect();

    if paths.is_empty() {
        return;
    }

    app.state::<PendingFiles>()
        .0
        .lock()
        .unwrap()
        .extend(paths.clone());

    let _ = app.emit("opened", paths);
}

#[tauri::command]
fn take_opened_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    state.0.lock().unwrap().drain(..).collect()
}

#[tauri::command]
fn open_dropped_files(app: AppHandle, paths: Vec<String>) {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    handle_opened_files(&app, expand_document_paths(paths));
}

#[tauri::command]
fn allow_dropped_paths(app: AppHandle, paths: Vec<String>) {
    for path in paths {
        allow_file(&app, Path::new(&path));
    }
}

#[cfg(any(windows, target_os = "linux"))]
fn paths_from_args() -> Vec<PathBuf> {
    std::env::args()
        .skip(1)
        .filter_map(|arg| {
            if arg.starts_with('-') {
                return None;
            }
            if let Ok(url) = url::Url::parse(&arg) {
                return url.to_file_path().ok();
            }
            Some(PathBuf::from(arg))
        })
        .collect()
}

#[cfg(any(windows, target_os = "linux"))]
fn handle_launch_files(app: &tauri::App) {
    let files = paths_from_args();
    if !files.is_empty() {
        handle_opened_files(&app.handle(), files);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingFiles(Mutex::new(Vec::new())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            take_opened_files,
            open_dropped_files,
            allow_dropped_paths,
            export_pdf_file,
            http_fetch,
        ])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            handle_launch_files(app);
            #[cfg(not(any(windows, target_os = "linux")))]
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let files: Vec<PathBuf> = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                handle_opened_files(app, files);
            }
        });
}
