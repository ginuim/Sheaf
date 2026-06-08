const STORAGE_KEY = "blank-export-card";

export type ExportCardSettings = {
  author: string;
  authorDesc: string;
};

const DEFAULT_SETTINGS: ExportCardSettings = {
  author: "Sheaf Writer",
  authorDesc: "写于 Sheaf 极简排版",
};

export function loadExportCardSettings(): ExportCardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw) as Partial<ExportCardSettings>;
    return {
      author: parsed.author?.trim() || DEFAULT_SETTINGS.author,
      authorDesc: parsed.authorDesc?.trim() || DEFAULT_SETTINGS.authorDesc,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveExportCardSettings(settings: ExportCardSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
