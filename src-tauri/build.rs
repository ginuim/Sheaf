fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "take_opened_files",
                "open_dropped_files",
                "allow_dropped_paths",
                "export_pdf_file",
                "http_fetch",
            ]),
        ),
    )
    .expect("failed to run build script");
}
