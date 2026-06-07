import { computed, ref, watch, type Ref } from "vue";
import { isBlankDocument } from "./useAI";

export type DocumentVersionKind = "snapshot";

export interface DocumentVersion {
  id: string;
  timestamp: number;
  label: string;
  content: string;
  kind: DocumentVersionKind;
  historyItemId?: string;
  previousContent?: string;
}

const VERSIONS_KEY_PREFIX = "blank.doc-versions:";
const MAX_VERSIONS = 48;

function versionsStorageKey(documentKey: string) {
  return `${VERSIONS_KEY_PREFIX}${documentKey}`;
}

function normalizeLabel(label: string) {
  return label.replace(/^(修改前|修改后|应用前|应用后)\s*·\s*/, "").trim() || "历史版本";
}

function normalizeVersion(value: unknown): DocumentVersion | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Omit<DocumentVersion, "kind">> & { kind?: unknown };
  if (typeof item.id !== "string" || typeof item.timestamp !== "number") return null;
  if (typeof item.label !== "string" || typeof item.content !== "string") return null;
  if (item.kind !== "snapshot" && item.kind !== "ai-before" && item.kind !== "ai-after") return null;
  if (/^(修改前|应用前)\s*·\s*/.test(item.label)) return null;

  return {
    id: item.id,
    timestamp: item.timestamp,
    label: normalizeLabel(item.label),
    content: item.content,
    kind: "snapshot",
    historyItemId: typeof item.historyItemId === "string" ? item.historyItemId : undefined,
    previousContent: typeof item.previousContent === "string" ? item.previousContent : undefined
  };
}

function loadSnapshots(documentKey: string): DocumentVersion[] {
  try {
    const raw = localStorage.getItem(versionsStorageKey(documentKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeVersion)
      .filter((item): item is DocumentVersion => item !== null)
      .sort((left, right) => right.timestamp - left.timestamp);
  } catch {
    return [];
  }
}

function saveSnapshots(documentKey: string, versions: DocumentVersion[]) {
  localStorage.setItem(versionsStorageKey(documentKey), JSON.stringify(versions.slice(0, MAX_VERSIONS)));
}

export function migrateDocumentVersionsKey(fromKey: string, toKey: string) {
  const from = fromKey.trim();
  const to = toKey.trim();
  if (!from || !to || from === to) return;

  const fromItems = loadSnapshots(from);
  if (fromItems.length === 0) {
    localStorage.removeItem(versionsStorageKey(from));
    return;
  }

  const existing = loadSnapshots(to);
  const merged = new Map<string, DocumentVersion>();
  for (const version of [...fromItems, ...existing]) {
    merged.set(version.id, version);
  }
  saveSnapshots(
    to,
    [...merged.values()].sort((left, right) => right.timestamp - left.timestamp),
  );
  localStorage.removeItem(versionsStorageKey(from));
}

const snapshotRefs = new Map<string, Ref<DocumentVersion[]>>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function snapshotsForKey(documentKey: string) {
  let snapshots = snapshotRefs.get(documentKey);
  if (snapshots) return snapshots;

  snapshots = ref(loadSnapshots(documentKey));
  snapshotRefs.set(documentKey, snapshots);

  watch(
    snapshots,
    (list) => {
      const previousTimer = persistTimers.get(documentKey);
      if (previousTimer) clearTimeout(previousTimer);
      persistTimers.set(
        documentKey,
        setTimeout(() => {
          saveSnapshots(documentKey, list);
          persistTimers.delete(documentKey);
        }, 200),
      );
    },
    { deep: true },
  );

  return snapshots;
}

export function useDocumentVersions(getDocumentKey: () => string = () => "__untitled__") {
  const documentKey = ref(getDocumentKey());
  const snapshots = computed(() => snapshotsForKey(documentKey.value).value);

  watch(
    () => getDocumentKey(),
    (nextKey) => {
      documentKey.value = nextKey;
      snapshotsForKey(nextKey);
    },
  );

  function addSnapshot(label: string, content: string, previousContent?: string, timestamp = Date.now()) {
    if (isBlankDocument(content)) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const currentSnapshots = snapshotsForKey(documentKey.value);
    const latest = currentSnapshots.value[0];
    const normalizedLabel = normalizeLabel(label);
    if (latest?.content === content && latest.label === normalizedLabel) return;

    const version: DocumentVersion = {
      id: `${timestamp}:${Math.random().toString(36).slice(2, 7)}`,
      timestamp,
      label: normalizedLabel,
      content,
      kind: "snapshot",
      previousContent,
    };

    currentSnapshots.value = [version, ...currentSnapshots.value].slice(0, MAX_VERSIONS);
  }

  function listVersions() {
    return [...snapshots.value].sort((left, right) => right.timestamp - left.timestamp);
  }

  function removeVersionsForHistoryItem(historyItemId: string) {
    const currentSnapshots = snapshotsForKey(documentKey.value);
    currentSnapshots.value = currentSnapshots.value.filter((version) => version.historyItemId !== historyItemId);
  }

  function clearSnapshots() {
    snapshotsForKey(documentKey.value).value = [];
  }

  return {
    snapshots,
    addSnapshot,
    listVersions,
    removeVersionsForHistoryItem,
    clearSnapshots
  };
}
