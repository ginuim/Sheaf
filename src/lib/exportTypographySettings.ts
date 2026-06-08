const STORAGE_KEY = "blank-export-typography";

export type ExportTypographySettings = {
  chineseEnglishSpacing: boolean;
};

export function loadExportTypographySettings(): ExportTypographySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { chineseEnglishSpacing: true };

    const parsed = JSON.parse(raw) as Partial<ExportTypographySettings>;
    return {
      chineseEnglishSpacing: parsed.chineseEnglishSpacing ?? true,
    };
  } catch {
    return { chineseEnglishSpacing: true };
  }
}

export function saveExportTypographySettings(settings: ExportTypographySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
