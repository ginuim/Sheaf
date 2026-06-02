const STORAGE_KEY = "blank.recent-files";
const MAX_RECENT = 10;

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecent(paths: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}

export async function getMissingRecent(paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();

  const { isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) return new Set();

  const { exists } = await import("@tauri-apps/plugin-fs");
  const missing = new Set<string>();

  for (const path of paths) {
    try {
      if (!(await exists(path))) missing.add(path);
    } catch {
      missing.add(path);
    }
  }

  return missing;
}

export function addRecent(path: string): string[] {
  const paths = loadRecent().filter((p) => p !== path);
  paths.unshift(path);
  const trimmed = paths.slice(0, MAX_RECENT);
  saveRecent(trimmed);
  return trimmed;
}

export function removeRecent(path: string): string[] {
  const paths = loadRecent().filter((p) => p !== path);
  saveRecent(paths);
  return paths;
}

export function clearRecent(): void {
  localStorage.removeItem(STORAGE_KEY);
}
