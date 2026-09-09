/** Chromium page-zoom presets, stored as percent. */
export const CONTENT_ZOOM_PRESETS = [
  25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500,
] as const;

export const CONTENT_ZOOM_MIN = CONTENT_ZOOM_PRESETS[0];
export const CONTENT_ZOOM_MAX = CONTENT_ZOOM_PRESETS[CONTENT_ZOOM_PRESETS.length - 1];
export const CONTENT_ZOOM_DEFAULT = 100;

export const CONTENT_ZOOM_STORAGE_KEY = "sheaf:content-zoom-percent";

export type ContentZoomAction = "in" | "out" | "reset";

export function clampContentZoom(percent: number): number {
  if (!Number.isFinite(percent)) return CONTENT_ZOOM_DEFAULT;
  return Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, Math.round(percent)));
}

export function zoomInContent(percent: number): number {
  const current = clampContentZoom(percent);
  for (const preset of CONTENT_ZOOM_PRESETS) {
    if (preset > current) return preset;
  }
  return CONTENT_ZOOM_MAX;
}

export function zoomOutContent(percent: number): number {
  const current = clampContentZoom(percent);
  for (let i = CONTENT_ZOOM_PRESETS.length - 1; i >= 0; i--) {
    if (CONTENT_ZOOM_PRESETS[i] < current) return CONTENT_ZOOM_PRESETS[i];
  }
  return CONTENT_ZOOM_MIN;
}

export function loadContentZoomPercent(): number {
  const raw = localStorage.getItem(CONTENT_ZOOM_STORAGE_KEY);
  if (raw === null) return CONTENT_ZOOM_DEFAULT;
  return clampContentZoom(Number(raw));
}

export function saveContentZoomPercent(percent: number) {
  localStorage.setItem(CONTENT_ZOOM_STORAGE_KEY, String(clampContentZoom(percent)));
}

export function contentZoomActionFromKeyboard(e: KeyboardEvent): ContentZoomAction | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;

  if (e.code === "Equal" || e.code === "NumpadAdd" || e.key === "+" || e.key === "=") {
    return "in";
  }
  if (e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-" || e.key === "_") {
    return "out";
  }
  if (!e.shiftKey && (e.code === "Digit0" || e.code === "Numpad0" || e.key === "0")) {
    return "reset";
  }
  return null;
}
