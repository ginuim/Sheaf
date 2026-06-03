use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

fn encode_file_url_path(path: &str) -> String {
    let mut encoded = String::new();

    for byte in path.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

fn file_url_from_path(path: &Path) -> String {
    let normalized_path = path.to_string_lossy().replace('\\', "/");
    let absolute_path = if normalized_path.starts_with('/') {
        normalized_path
    } else if normalized_path.len() >= 2 && normalized_path.as_bytes()[1] == b':' {
        format!("/{normalized_path}")
    } else {
        format!("/{normalized_path}")
    };

    format!("file://{}", encode_file_url_path(&absolute_path))
}

fn browser_pdf_arguments(
    source_path: &Path,
    target_path: &Path,
    profile_path: &Path,
) -> Vec<String> {
    vec![
        "--headless=new".to_string(),
        "--disable-gpu".to_string(),
        "--allow-file-access-from-files".to_string(),
        "--disable-background-networking".to_string(),
        "--disable-component-update".to_string(),
        "--disable-extensions".to_string(),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        format!("--user-data-dir={}", profile_path.display()),
        "--no-pdf-header-footer".to_string(),
        format!("--print-to-pdf={}", target_path.display()),
        file_url_from_path(source_path),
    ]
}

fn path_executable(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;

    for directory in std::env::split_paths(&path) {
        let candidate = directory.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }

        #[cfg(target_os = "windows")]
        {
            let exe_candidate = directory.join(format!("{name}.exe"));
            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }

    None
}

fn pdf_renderer_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            PathBuf::from("/Applications/Chromium.app/Contents/MacOS/Chromium"),
            PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ]);
    }

    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
            if let Some(base_path) = std::env::var_os(variable) {
                let base_path = PathBuf::from(base_path);
                candidates.extend([
                    base_path.join("Google/Chrome/Application/chrome.exe"),
                    base_path.join("Chromium/Application/chrome.exe"),
                    base_path.join("Microsoft/Edge/Application/msedge.exe"),
                ]);
            }
        }
    }

    for executable in [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "microsoft-edge-stable",
        "msedge",
    ] {
        if let Some(candidate) = path_executable(executable) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn find_pdf_renderer() -> Option<PathBuf> {
    pdf_renderer_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn unique_pdf_export_temp_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    std::env::temp_dir().join(format!("sheaf-pdf-export-{}-{nanos}", std::process::id()))
}

fn pdf_output_file_size(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .map(|metadata| metadata.len())
        .filter(|size| *size > 0)
}

fn run_pdf_renderer_process_with_timeout(
    binary: &Path,
    args: &[String],
    target_path: &Path,
    timeout: Duration,
    poll_interval: Duration,
    stable_output_duration: Duration,
) -> Result<bool, String> {
    let mut child = Command::new(binary)
        .args(args)
        .spawn()
        .map_err(|error| format!("无法启动 PDF 渲染器: {error}"))?;
    let started_at = Instant::now();
    let mut last_output_size = 0;
    let mut stable_output_since: Option<Instant> = None;

    loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Ok(status.success());
        }

        let now = Instant::now();
        if let Some(output_size) = pdf_output_file_size(target_path) {
            if output_size == last_output_size {
                let stable_since = stable_output_since.get_or_insert(now);
                if now.duration_since(*stable_since) >= stable_output_duration {
                    let _kill_result = child.kill();
                    let _wait_result = child.wait();
                    return Ok(true);
                }
            } else {
                last_output_size = output_size;
                stable_output_since = Some(now);
            }
        }

        if now.duration_since(started_at) >= timeout {
            let _kill_result = child.kill();
            let _wait_result = child.wait();
            return Ok(false);
        }

        thread::sleep(poll_interval);
    }
}

fn run_pdf_renderer_process(
    binary: &Path,
    args: &[String],
    target_path: &Path,
) -> Result<bool, String> {
    run_pdf_renderer_process_with_timeout(
        binary,
        args,
        target_path,
        Duration::from_secs(45),
        Duration::from_millis(100),
        Duration::from_millis(700),
    )
}

fn export_pdf_file_with_renderer(
    path: String,
    html: String,
    renderer_path: &Path,
    mut render: impl FnMut(&Path, &Path, &Path, &[String]) -> Result<bool, String>,
) -> Result<(), String> {
    if html.trim().is_empty() {
        return Err("导出内容为空".to_string());
    }

    let target_path = PathBuf::from(path);
    let temp_root = unique_pdf_export_temp_dir();
    let source_path = temp_root.join("index.html");
    let output_path = temp_root.join("output.pdf");
    let profile_path = temp_root.join("profile");

    fs::create_dir_all(&profile_path).map_err(|error| error.to_string())?;
    fs::write(&source_path, html).map_err(|error| error.to_string())?;

    let result = (|| {
        let args = browser_pdf_arguments(&source_path, &output_path, &profile_path);
        if !render(renderer_path, &source_path, &output_path, &args)? {
            return Err("PDF 渲染失败".to_string());
        }

        let metadata = fs::metadata(&output_path)
            .map_err(|_| "PDF 渲染器未生成输出文件".to_string())?;
        if metadata.len() == 0 {
            return Err("PDF 渲染器生成了空文件".to_string());
        }

        fs::copy(&output_path, &target_path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    let _cleanup_result = fs::remove_dir_all(&temp_root);

    result
}

fn export_pdf_file_blocking(path: String, html: String) -> Result<(), String> {
    let renderer_path = find_pdf_renderer().ok_or_else(|| {
        "导出 PDF 需要安装 Google Chrome、Chromium 或 Microsoft Edge".to_string()
    })?;

    export_pdf_file_with_renderer(
        path,
        html,
        &renderer_path,
        |binary, _source_path, output_path, args| {
            let renderer_succeeded = run_pdf_renderer_process(binary, args, output_path)?;
            if !renderer_succeeded {
                return Ok(false);
            }

            Ok(pdf_output_file_size(output_path).is_some())
        },
    )
}

#[tauri::command]
pub(crate) async fn export_pdf_file(path: String, html: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || export_pdf_file_blocking(path, html))
        .await
        .map_err(|error| format!("PDF 导出任务失败: {error}"))?
}
