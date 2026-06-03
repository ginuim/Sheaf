fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "take_opened_files",
                "open_dropped_files",
                "export_pdf_file",
            ]),
        ),
    )
    .expect("failed to run build script");
}
