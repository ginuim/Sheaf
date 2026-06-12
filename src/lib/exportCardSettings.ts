const STORAGE_KEY = "blank-export-card";

export type ExportCardSettings = {
  author: string;
  authorDesc: string;
  longImageMaxHeight: number;
  longImageQrEnabled: boolean;
  longImageQrUrl: string;
  longImageQrLabel: string;
};

const DEFAULT_SETTINGS: ExportCardSettings = {
  author: "Sheaf Writer",
  authorDesc: "写于 Sheaf 极简排版",
  longImageMaxHeight: 0,
  longImageQrEnabled: false,
  longImageQrUrl: "",
  longImageQrLabel: "",
};

function normalizeMaxHeight(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

export function loadExportCardSettings(): ExportCardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw) as Partial<ExportCardSettings>;
    return {
      author: parsed.author?.trim() || DEFAULT_SETTINGS.author,
      authorDesc: parsed.authorDesc?.trim() || DEFAULT_SETTINGS.authorDesc,
      longImageMaxHeight: normalizeMaxHeight(parsed.longImageMaxHeight),
      longImageQrEnabled: Boolean(parsed.longImageQrEnabled),
      longImageQrUrl: parsed.longImageQrUrl?.trim() || "",
      longImageQrLabel: parsed.longImageQrLabel?.trim() || "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveExportCardSettings(settings: ExportCardSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
