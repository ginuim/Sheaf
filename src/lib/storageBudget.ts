type StoragePayloadInfo = {
  key: string;
  timestamp: number;
};

const LARGE_STORAGE_PREFIXES = [
  "blank.ai-history:",
  "blank.ai-active-conversation:",
  "blank.doc-versions:",
];

function isQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}

function timestampFromPayload(raw: string | null) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.reduce((latest, item) => {
        if (!item || typeof item !== "object") return latest;
        const timestamp = (item as { timestamp?: unknown }).timestamp;
        return typeof timestamp === "number" && Number.isFinite(timestamp)
          ? Math.max(latest, timestamp)
          : latest;
      }, 0);
    }
    if (parsed && typeof parsed === "object") {
      const timestamp = (parsed as { updatedAt?: unknown; timestamp?: unknown }).updatedAt
        ?? (parsed as { timestamp?: unknown }).timestamp;
      return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

function largeStorageKeys(exceptKey: string): StoragePayloadInfo[] {
  const items: StoragePayloadInfo[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || key === exceptKey) continue;
    if (!LARGE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    items.push({
      key,
      timestamp: timestampFromPayload(localStorage.getItem(key)),
    });
  }
  return items.sort((left, right) => left.timestamp - right.timestamp);
}

function evictLargeStorageEntries(exceptKey: string, count: number) {
  const candidates = largeStorageKeys(exceptKey).slice(0, count);
  for (const item of candidates) {
    localStorage.removeItem(item.key);
  }
  return candidates.length;
}

export function safeSetLocalStorageItem(
  key: string,
  value: string,
  options: {
    onQuotaExceeded?: (attempt: number) => string | null;
  } = {},
) {
  let nextValue: string | null = value;

  for (let attempt = 0; attempt < 5 && nextValue !== null; attempt += 1) {
    try {
      localStorage.setItem(key, nextValue);
      return true;
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;

      const evicted = evictLargeStorageEntries(key, Math.max(1, attempt + 1));
      const reducedValue = options.onQuotaExceeded?.(attempt) ?? null;
      if (reducedValue === null && evicted === 0) return false;
      if (reducedValue !== null) nextValue = reducedValue;
    }
  }

  return false;
}

export function safeSetLocalStorageJson<T>(
  key: string,
  value: T,
  options: {
    onQuotaExceeded?: (attempt: number) => T | null;
  } = {},
) {
  return safeSetLocalStorageItem(key, JSON.stringify(value), {
    onQuotaExceeded: options.onQuotaExceeded
      ? (attempt) => {
          const nextValue = options.onQuotaExceeded?.(attempt) ?? null;
          return nextValue === null ? null : JSON.stringify(nextValue);
        }
      : undefined,
  });
}
