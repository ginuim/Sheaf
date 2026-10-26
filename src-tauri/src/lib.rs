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

/// Resolves one command-line argument to a file path.
///
/// Windows and Linux hand associated files over as plain path arguments, e.g.
/// `Sheaf.exe "C:\notes\todo.md"`, while some launchers pass `file://` URLs.
///
/// Plain Windows paths must never go through `Url::parse`: `C:\notes\todo.md`
/// parses as a URL with the scheme `c`, and `to_file_path()` then fails, which
/// would silently drop the argument and leave the app on the start page.
#[cfg_attr(not(any(windows, target_os = "linux")), allow(dead_code))]
fn path_from_argument(argument: &str) -> Option<PathBuf> {
    let trimmed = argument.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }

    let is_file_url = trimmed
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("file:"));
    if is_file_url {
        // `to_file_path` also percent-decodes and maps drive letters on Windows.
        return url::Url::parse(trimmed).ok()?.to_file_path().ok();
    }

    Some(PathBuf::from(trimmed))
}

#[cfg(any(windows, target_os = "linux"))]
fn paths_from_args() -> Vec<PathBuf> {
    std::env::args_os()
        .skip(1)
        .filter_map(|argument| {
            // `args_os` keeps non-UTF-8 file names intact on Linux; only fall back
            // to the trimmed string when the argument was actually modified.
            let raw = argument.to_string_lossy();
            let path = path_from_argument(&raw)?;
            if path.as_os_str() == raw.as_ref() {
                Some(PathBuf::from(argument))
            } else {
                Some(path)
            }
        })
        .collect()
}

#[cfg(any(windows, target_os = "linux"))]
fn handle_launch_files(app: &tauri::App) {
    let files = expand_document_paths(paths_from_args());
    if !files.is_empty() {
        handle_opened_files(&app.handle(), files);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_windows_paths_verbatim() {
        assert_eq!(
            path_from_argument(r"C:\Users\tao\notes\todo.md"),
            Some(PathBuf::from(r"C:\Users\tao\notes\todo.md"))
        );
        assert_eq!(
            path_from_argument(r"\\server\share\todo.md"),
            Some(PathBuf::from(r"\\server\share\todo.md"))
        );
    }

    #[test]
    fn keeps_plain_paths_and_strips_quotes() {
        assert_eq!(
            path_from_argument("/home/tao/notes/todo.md"),
            Some(PathBuf::from("/home/tao/notes/todo.md"))
        );
        assert_eq!(
            path_from_argument(r#""/tmp/a b.md""#),
            Some(PathBuf::from("/tmp/a b.md"))
        );
    }

    #[test]
    fn decodes_file_urls() {
        let path = path_from_argument("file:///home/tao/a%20b.md");
        assert_eq!(path, Some(PathBuf::from("/home/tao/a b.md")));
        assert!(path_from_argument("FILE:///home/tao/a.md").is_some());
    }

    #[test]
    fn ignores_flags_and_empty_arguments() {
        assert_eq!(path_from_argument("--inspect"), None);
        assert_eq!(path_from_argument("   "), None);
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
