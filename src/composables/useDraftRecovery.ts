const STORAGE_KEY = "blank.unsaved-draft";

export type UnsavedDraft = {
  baselineContent: string;
  content: string;
  fileName: string;
  filePath: string | null;
  updatedAt: number;
};

function normalizeDraft(value: unknown): UnsavedDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<UnsavedDraft>;
  if (typeof draft.content !== "string" || typeof draft.baselineContent !== "string") return null;
  if (typeof draft.fileName !== "string" || typeof draft.updatedAt !== "number") return null;
  if (draft.filePath !== null && typeof draft.filePath !== "string") return null;

  return {
    baselineContent: draft.baselineContent,
    content: draft.content,
    fileName: draft.fileName,
    filePath: draft.filePath ?? null,
    updatedAt: draft.updatedAt
  };
}

export function loadUnsavedDraft(): UnsavedDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveUnsavedDraft(draft: UnsavedDraft) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearUnsavedDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasRecoverableDraft(draft: UnsavedDraft | null) {
  if (!draft) return false;
  if (draft.content === draft.baselineContent) return false;
  if (draft.content.trim().length === 0 && draft.baselineContent.trim().length === 0) return false;
  return true;
}

export function formatDraftUpdatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
