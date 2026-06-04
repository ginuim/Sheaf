import { ref, watch } from "vue";
import { applyChangesToDoc, type AIHistoryItem } from "./useAI";

export type DocumentVersionKind = "ai-before" | "ai-after" | "snapshot";

export interface DocumentVersion {
  id: string;
  timestamp: number;
  label: string;
  content: string;
  kind: DocumentVersionKind;
  historyItemId?: string;
}

const VERSIONS_KEY_PREFIX = "blank.doc-versions:";
const MAX_VERSIONS = 48;

function versionsStorageKey(documentKey: string) {
  return `${VERSIONS_KEY_PREFIX}${documentKey}`;
}

import { isBlankDocument, isBlankToAiEdit } from "./useAI";

function truncateLabel(text: string, max = 28) {
  const line = text.split("\n").map((part) => part.trim()).find((part) => part.length > 0) ?? "";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function normalizeVersion(value: unknown): DocumentVersion | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DocumentVersion>;
  if (typeof item.id !== "string" || typeof item.timestamp !== "number") return null;
  if (typeof item.label !== "string" || typeof item.content !== "string") return null;
  if (item.kind !== "ai-before" && item.kind !== "ai-after" && item.kind !== "snapshot") return null;

  return {
    id: item.id,
    timestamp: item.timestamp,
    label: item.label,
    content: item.content,
    kind: item.kind,
    historyItemId: typeof item.historyItemId === "string" ? item.historyItemId : undefined
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

export function getHistoryItemResultDoc(item: AIHistoryItem) {
  if (item.resultDoc) return item.resultDoc;
  if (item.changes.length === 0) return item.originalDoc;
  return applyChangesToDoc(item.originalDoc, item.changes);
}

export function versionsFromHistoryItem(item: AIHistoryItem): DocumentVersion[] {
  if (item.changes.length === 0) return [];
  if (isBlankToAiEdit(item)) return [];

  const labelBase = truncateLabel(item.instruction);
  const versions: DocumentVersion[] = [];

  if (!isBlankDocument(item.originalDoc)) {
    versions.push({
      id: `${item.id}:before`,
      timestamp: item.timestamp,
      label: `修改前 · ${labelBase}`,
      content: item.originalDoc,
      kind: "ai-before",
      historyItemId: item.id
    });
  }

  if (item.status === "done" || item.status === "applied") {
    versions.push({
      id: `${item.id}:after`,
      timestamp: item.timestamp + 1,
      label: `修改后 · ${labelBase}`,
      content: getHistoryItemResultDoc(item),
      kind: "ai-after",
      historyItemId: item.id
    });
  }

  return versions;
}

export function mergeDocumentVersions(
  snapshots: DocumentVersion[],
  history: AIHistoryItem[]
): DocumentVersion[] {
  const merged = new Map<string, DocumentVersion>();

  for (const item of history) {
    if (isBlankToAiEdit(item)) continue;
    for (const version of versionsFromHistoryItem(item)) {
      merged.set(version.id, version);
    }
  }

  for (const snapshot of snapshots) {
    merged.set(snapshot.id, snapshot);
  }

  return [...merged.values()].sort((left, right) => right.timestamp - left.timestamp);
}

export function useDocumentVersions(getDocumentKey: () => string = () => "__untitled__") {
  const snapshots = ref<DocumentVersion[]>(loadSnapshots(getDocumentKey()));
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => getDocumentKey(),
    (documentKey) => {
      snapshots.value = loadSnapshots(documentKey);
    }
  );

  watch(
    snapshots,
    (list) => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        saveSnapshots(getDocumentKey(), list);
      }, 200);
    },
    { deep: true }
  );

  function addSnapshot(label: string, content: string, timestamp = Date.now()) {
    if (isBlankDocument(content)) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const latest = snapshots.value[0];
    if (latest?.content === content && latest.label === label) return;

    const version: DocumentVersion = {
      id: `${timestamp}:${Math.random().toString(36).slice(2, 7)}`,
      timestamp,
      label,
      content,
      kind: "snapshot"
    };

    snapshots.value = [version, ...snapshots.value].slice(0, MAX_VERSIONS);
  }

  function listVersions(history: AIHistoryItem[]) {
    return mergeDocumentVersions(snapshots.value, history);
  }

  function removeVersionsForHistoryItem(historyItemId: string) {
    snapshots.value = snapshots.value.filter((version) => version.historyItemId !== historyItemId);
  }

  function clearSnapshots() {
    snapshots.value = [];
  }

  return {
    snapshots,
    addSnapshot,
    listVersions,
    removeVersionsForHistoryItem,
    clearSnapshots
  };
}
