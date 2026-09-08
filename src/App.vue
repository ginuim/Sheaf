<script setup lang="ts">
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import AppToast from "./components/AppToast.vue";
import AIPanel from "./components/AIPanel.vue";
import AIVersionViewer from "./components/AIVersionViewer.vue";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import MarkdownPreview from "./components/MarkdownPreview.vue";
import EditorSearchReplace from "./components/EditorSearchReplace.vue";
import PaneZenButton from "./components/PaneZenButton.vue";
import DocumentSwitcher from "./components/DocumentSwitcher.vue";
import ExportStudio from "./components/ExportStudio.vue";
import OutlinePanel from "./components/OutlinePanel.vue";
import AboutPanel from "./components/AboutPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import UpdateDialog from "./components/UpdateDialog.vue";
import ImageCropDialog from "./components/ImageCropDialog.vue";
import StartPage from "./components/StartPage.vue";
import Toolbar from "./components/Toolbar.vue";
import type { ViewMode } from "./components/Toolbar.vue";
import type { AgentContextSnippet, EditChange, AIHistoryItem } from "./composables/useAI";
import { migrateAiHistoryKey, applyChangesToDoc } from "./composables/useAI";
import type { ProofreadIssue } from "./types/proofreading";
import { migrateDocumentVersionsKey, useDocumentVersions } from "./composables/useDocumentVersions";
import { refreshRecentMenu, setupAppMenu, type AppMenuHandlers } from "./composables/useAppMenu";
import { exportPdf, type ExportPdfStage } from "./composables/usePdfExport";
import { useAppToast } from "./composables/useAppToast";
import { useAutoUpdater } from "./composables/useAutoUpdater";
import { buildWechatHtmlForCopy, copyWechatHtml } from "./composables/useWechatExport";
import { resolveLinkHref } from "./composables/resolveMediaSrc";
import { useFile } from "./composables/useFile";
import { findActiveOutlineItem, parseOutline, type OutlineItem } from "./composables/useOutline";
import {
  addRecent,
  clearRecent,
  loadRecent,
  removeRecent,
} from "./composables/useRecentFiles";
import { useTheme } from "./composables/useTheme";
import { translate, useLocale } from "./composables/useLocale";
import { useAppPreferences } from "./composables/useAppPreferences";
import {
  applyChineseEnglishSpacingToMarkdownSource,
  needsChineseEnglishSpacingFormatting,
} from "./lib/cjkSpacing";
import { filterImagePaths } from "./lib/dropped-paths";
import { mimeTypeFromPath, extensionFromMimeType, extensionFromSrc, sourceNameFromSrc, isExternalImageSrc } from "./lib/crop-image";
import { replaceImageSrc, findImageBySrc } from "./lib/markdown-image";
import {
  isImageHostingProviderConfigured,
  uploadToConfiguredImageHost,
} from "./lib/imageHosting";
import type { PreviewImageCropPayload } from "./components/MarkdownPreview.vue";
import { readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  clearUnsavedDraft,
  hasRecoverableDraft,
  loadUnsavedDraft,
  saveUnsavedDraft,
  type UnsavedDraft
} from "./composables/useDraftRecovery";

const DEFAULT_CONTENT = translate("app.defaultContent");
const SPLIT_WIDTH_STORAGE_KEY = "sheaf:split-editor-width-percent";
const DEFAULT_SPLIT_EDITOR_PERCENT = 50;
const MIN_SPLIT_PANE_PERCENT = 25;
const SPLIT_KEYBOARD_STEP = 2;

const { t, locale } = useLocale();
const { preferences: appPreferences } = useAppPreferences();
const content = ref(DEFAULT_CONTENT);
const baselineContent = ref(DEFAULT_CONTENT);
const isDirty = computed(() => content.value !== baselineContent.value);
const needsFormatSpacing = computed(() =>
  needsChineseEnglishSpacingFormatting(content.value),
);
const viewMode = ref<ViewMode>("split");
const zenMode = ref(false);
const zenRestoreViewMode = ref<ViewMode | null>(null);
const showOutline = ref(parseOutline(DEFAULT_CONTENT).length > 0);
const showExport = ref(false);
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const previewRef = ref<InstanceType<typeof MarkdownPreview> | null>(null);
const previewPaneRef = ref<HTMLElement | null>(null);
const previewSearchReplaceRef = ref<InstanceType<typeof EditorSearchReplace> | null>(null);
const previewSearchOpen = ref(false);
const previewSearchText = ref("");
const previewSearchCaseSensitive = ref(false);
const previewMatchTotal = ref(0);
const previewMatchCurrent = ref(0);
const previewMediaEpoch = ref(0);
const imageCropOpen = ref(false);
const imageCropTarget = ref<PreviewImageCropPayload | null>(null);
const imageCropPreviewSrc = ref("");
const imageCropObjectUrl = ref<string | null>(null);
const workspaceRef = ref<HTMLElement | null>(null);
const exporting = ref(false);
const exportingPdf = ref(false);
const exportPdfStage = ref<ExportPdfStage>("rendering");
const { showToast } = useAppToast();
const {
  appVersion,
  checkForUpdates,
  confirmPendingUpdate,
  dismissPendingUpdate,
  enabled: updatesEnabled,
  pendingUpdate,
  updateDialogOpen,
} = useAutoUpdater();
const exportPdfLoadingText = computed(() =>
  exportPdfStage.value === "rendering" ? t("app.renderingDoc") : t("app.generatingPdf"),
);
const showSettings = ref(false);
const settingsInitialTab = ref<"appearance" | "formatBar" | "imageHosting" | "aiModels" | "aiTools">("appearance");
const showAbout = ref(false);
const showAI = ref(false);
const showVersionHistory = ref(false);
const activeVersionId = ref<string | null>(null);
const proofreadIssues = ref<ProofreadIssue[]>([]);
const currentProofreadItemId = ref<string | null>(null);
const activeProofreadIssueId = ref<string | null>(null);
const pendingAiContext = ref<AgentContextSnippet | null>(null);
const previewingDiffItem = ref<AIHistoryItem | null>(null);
const showStartPage = ref(true);
const recentFiles = ref<string[]>(loadRecent());
const workspaceDocuments = ref<string[]>([]);
const pendingDraft = ref<UnsavedDraft | null>(loadUnsavedDraft());
const recoverableDraft = computed(() =>
  hasRecoverableDraft(pendingDraft.value) ? pendingDraft.value : null
);
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;
let scrollSyncing = false;
let lastScrollSource: "editor" | "preview" = "editor";
let splitResizeStartX = 0;
let splitResizeStartPercent = DEFAULT_SPLIT_EDITOR_PERCENT;
let splitResizeTotalWidth = 0;
let preserveProofreadIssuesOnNextContentChange = false;

type DocHistoryEntry = {
  path: string;
  scrollRatio: number;
};

const MAX_DOC_HISTORY = 20;
const docHistory = ref<DocHistoryEntry[]>([]);
const canGoBack = computed(() => docHistory.value.length > 0);
const splitEditorPercent = shallowRef(loadSplitEditorPercent());
const isSplitResizing = shallowRef(false);
const splitLayoutStyle = computed(() => ({
  "--editor-pane-grow": String(splitEditorPercent.value),
  "--preview-pane-grow": String(100 - splitEditorPercent.value),
}));

function createDraftSessionId() {
  return `draft:${crypto.randomUUID()}`;
}

function clampSplitEditorPercent(value: number) {
  return Math.min(
    Math.max(value, MIN_SPLIT_PANE_PERCENT),
    100 - MIN_SPLIT_PANE_PERCENT,
  );
}

function readStoredSplitEditorPercent(key: string) {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;

  const saved = Number(raw);
  return Number.isFinite(saved) ? saved : null;
}

function loadSplitEditorPercent() {
  const saved = readStoredSplitEditorPercent(SPLIT_WIDTH_STORAGE_KEY);
  if (saved !== null) return clampSplitEditorPercent(saved);

  return DEFAULT_SPLIT_EDITOR_PERCENT;
}

function setSplitEditorPercent(value: number, persist = true) {
  splitEditorPercent.value = clampSplitEditorPercent(value);
  if (persist) {
    localStorage.setItem(SPLIT_WIDTH_STORAGE_KEY, String(splitEditorPercent.value));
  }
}

const draftSessionId = ref(createDraftSessionId());

const outlineItems = computed(() => parseOutline(content.value));
const outlineSourceLine = ref(0);
const activeOutlineId = computed(
  () => findActiveOutlineItem(outlineItems.value, outlineSourceLine.value)?.id ?? null,
);

function setOutlineSourceLine(line: number | null | undefined) {
  if (typeof line !== "number" || !Number.isFinite(line)) return;
  outlineSourceLine.value = Math.max(0, line);
}

function syncOutlineFromEditor(preferCursor: boolean) {
  if (preferCursor) {
    setOutlineSourceLine(editorRef.value?.getCursorLine());
    return;
  }
  setOutlineSourceLine(editorRef.value?.getScrollAnchor()?.line);
}

function syncOutlineFromPreview(pane?: HTMLElement | null) {
  const el = pane ?? previewPaneRef.value;
  if (!el) return;
  setOutlineSourceLine(previewRef.value?.getScrollAnchor(el)?.line);
}

function onEditorPositionChange() {
  if (showOutline.value) syncOutlineFromEditor(true);
}

const { theme, toggleTheme } = useTheme();
const isDark = computed(() => theme.value === "dark");

function hasTauriRuntime() {
  return typeof window !== "undefined" && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function clearDocHistory() {
  docHistory.value = [];
}

function getCurrentScrollRatio(): number {
  const pane = previewPaneRef.value;
  if (showPreview.value && pane) {
    const max = pane.scrollHeight - pane.clientHeight;
    if (max > 0) return pane.scrollTop / max;
  }
  return editorRef.value?.getScrollRatio() ?? 0;
}

function pushDocHistory(path: string, scrollRatio: number) {
  docHistory.value = [
    ...docHistory.value.slice(-(MAX_DOC_HISTORY - 1)),
    { path, scrollRatio },
  ];
}

async function restoreScrollRatio(ratio: number) {
  await nextTick();
  requestAnimationFrame(() => {
    scrollSyncing = true;

    editorRef.value?.scrollRatio(ratio);

    const pane = previewPaneRef.value;
    if (pane) {
      const max = pane.scrollHeight - pane.clientHeight;
      pane.scrollTop = max * ratio;
    }

    requestAnimationFrame(() => {
      scrollSyncing = false;
    });
  });
}

function onPathOpened(path: string) {
  recentFiles.value = addRecent(path);
  void refreshRecentMenu(recentFiles.value);
}

const allowedAiReadPaths = computed(() => {
  const paths = new Set<string>();
  if (filePath.value) paths.add(filePath.value);
  for (const path of workspaceDocuments.value) {
    paths.add(path);
  }
  for (const path of recentFiles.value) {
    paths.add(path);
  }
  return paths;
});

async function readAiWorkspaceFile(path: string): Promise<string> {
  if (!allowedAiReadPaths.value.has(path)) {
    throw new Error(t("app.aiReadScopeError"));
  }
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(path);
}

const { filePath, fileName, diskContent, fileOperationInProgress, openFile, openFileAtPath, newFile, saveFile, saveFileAs, restoreFileState } =
  useFile(
    (loaded) => {
      content.value = loaded;
      baselineContent.value = loaded;
      showOutline.value = parseOutline(loaded).length > 0;
    },
    onPathOpened,
    () => {
      baselineContent.value = content.value;
      clearUnsavedDraft();
      pendingDraft.value = null;
    },
  );

async function ensureDocumentSavedForImage(): Promise<string | null> {
  if (filePath.value) return filePath.value;
  await saveFile(content.value);
  return filePath.value;
}

async function revealCurrentFileInFolder() {
  if (!filePath.value || !hasTauriRuntime()) return;

  try {
    await revealItemInDir(filePath.value);
  } catch {
    showToast("error", t("toolbar.revealInFolderFailed"));
  }
}

async function handleDroppedImagePaths(paths: string[]) {
  if (!paths.length || showStartPage.value) return;

  await invoke("allow_dropped_paths", { paths });
  editorRef.value?.insertDroppedImagePaths(paths);
}

const aiDocumentKey = computed(() => filePath.value ?? draftSessionId.value);
const documentVersions = useDocumentVersions(() => aiDocumentKey.value);
const documentVersionList = computed(() => documentVersions.listVersions());

watch(documentVersionList, (versions) => {
  if (!showVersionHistory.value) return;
  if (versions.some((version) => version.id === activeVersionId.value)) return;

  const latestVersion = versions[0];
  if (latestVersion) {
    activeVersionId.value = latestVersion.id;
    return;
  }

  closeVersionHistory();
});

watch(filePath, (nextPath, prevPath) => {
  if (nextPath && !prevPath) {
    migrateAiHistoryKey(draftSessionId.value, nextPath);
    migrateDocumentVersionsKey(draftSessionId.value, nextPath);
  }
});

function persistDraftSnapshot() {
  if (showStartPage.value) return;

  if (!isDirty.value) {
    clearUnsavedDraft();
    pendingDraft.value = null;
    return;
  }

  const draft: UnsavedDraft = {
    baselineContent: baselineContent.value,
    content: content.value,
    fileName: fileName.value,
    filePath: filePath.value,
    updatedAt: Date.now()
  };

  saveUnsavedDraft(draft);
  if (showStartPage.value) {
    pendingDraft.value = draft;
  }
}

watch(
  [content, baselineContent, filePath, fileName],
  () => {
    if (draftPersistTimer) clearTimeout(draftPersistTimer);
    draftPersistTimer = setTimeout(persistDraftSnapshot, 400);
  }
);

watch(content, () => {
  if (preserveProofreadIssuesOnNextContentChange) {
    preserveProofreadIssuesOnNextContentChange = false;
    return;
  }
  clearProofreadIssues();
});

function recoverUnsavedDraft() {
  const draft = recoverableDraft.value;
  if (!draft) return;

  restoreFileState({
    content: draft.content,
    fileName: draft.fileName,
    filePath: draft.filePath,
    diskContent: draft.baselineContent,
  });
  baselineContent.value = draft.baselineContent;
  showOutline.value = parseOutline(draft.content).length > 0;
  showStartPage.value = false;
  clearDocHistory();
}

function discardUnsavedDraft() {
  clearUnsavedDraft();
  pendingDraft.value = null;
}

let nativePromptOpen = false;

async function confirmDiscardChanges(): Promise<boolean> {
  if (!isDirty.value) return true;
  nativePromptOpen = true;
  try {
    return await ask(t("app.unsavedChanges"), {
      title: t("app.title"),
      kind: "warning",
    });
  } finally {
    nativePromptOpen = false;
  }
}

let checkingExternalFile = false;

async function checkCurrentFileForExternalChanges() {
  const checkedPath = filePath.value;
  if (
    !checkedPath ||
    showStartPage.value ||
    checkingExternalFile ||
    nativePromptOpen ||
    fileOperationInProgress.value
  ) return;

  checkingExternalFile = true;
  try {
    const nextDiskContent = await readTextFile(checkedPath);
    if (filePath.value !== checkedPath || showStartPage.value) return;
    if (diskContent.value === null) {
      diskContent.value = nextDiskContent;
      return;
    }
    if (nextDiskContent === diskContent.value) return;

    // Record the observed version before opening the native prompt so focus
    // events caused by the prompt cannot enqueue the same change again.
    diskContent.value = nextDiskContent;

    if (nextDiskContent === content.value) {
      baselineContent.value = nextDiskContent;
      clearUnsavedDraft();
      pendingDraft.value = null;
      return;
    }

    const shouldRefresh = await ask(
      t(isDirty.value ? "app.externalFileChangedDirty" : "app.externalFileChanged"),
      { title: t("app.title"), kind: "warning" },
    );
    if (filePath.value !== checkedPath || showStartPage.value) return;

    // The current editor contents are compared with the latest disk version.
    // Declining therefore keeps the editor contents and marks them as dirty.
    baselineContent.value = nextDiskContent;
    if (!shouldRefresh) return;

    content.value = nextDiskContent;
    showOutline.value = parseOutline(nextDiskContent).length > 0;
    clearUnsavedDraft();
    pendingDraft.value = null;
  } catch {
    // A temporarily unavailable or deleted file cannot be refreshed. Existing
    // content remains intact and normal open/save errors continue to handle it.
  } finally {
    checkingExternalFile = false;
  }
}

async function closeCurrentDocument() {
  if (showStartPage.value) return;
  if (!(await confirmDiscardChanges())) return;

  newFile();
  draftSessionId.value = createDraftSessionId();
  workspaceDocuments.value = [];
  showStartPage.value = true;
  showExport.value = false;
  showAI.value = false;
  closeVersionHistory();
  clearDocHistory();
  clearUnsavedDraft();
  pendingDraft.value = null;
}

async function newFileWithConfirm() {
  if (!(await confirmDiscardChanges())) return;
  newFile();
  draftSessionId.value = createDraftSessionId();
  baselineContent.value = "";
  showStartPage.value = false;
  clearDocHistory();
}

async function openFileWithConfirm() {
  if (!(await confirmDiscardChanges())) return;
  const opened = await openFile();
  if (opened) {
    workspaceDocuments.value = filePath.value ? [filePath.value] : [];
    showStartPage.value = false;
    clearDocHistory();
  }
}

async function openRecentFile(path: string) {
  if (!(await confirmDiscardChanges())) return;

  const ok = await openFileAtPath(path);
  if (!ok) {
    await message(t("app.fileReadError"), {
      title: t("app.title"),
      kind: "error",
    });
    return;
  }

  showStartPage.value = false;
  workspaceDocuments.value = [path];
  clearDocHistory();
}

async function openAssociatedFile(path: string): Promise<boolean> {
  if (!(await confirmDiscardChanges())) return false;

  const ok = await openFileAtPath(path);
  if (!ok) {
    await message(t("app.fileReadError"), {
      title: t("app.title"),
      kind: "error",
    });
  }

  if (ok) {
    showStartPage.value = false;
  }

  return ok;
}

async function handleOpenLink(href: string) {
  const resolved = resolveLinkHref(filePath.value, href);
  if (resolved.type === "error") {
    await message(resolved.message, { title: t("app.title"), kind: "warning" });
    return;
  }

  if (resolved.type === "external") {
    if (isTauri()) {
      await openUrl(resolved.href);
    } else {
      window.open(resolved.href, "_blank", "noopener,noreferrer");
    }
    return;
  }

  const currentPath = filePath.value;
  const currentScrollRatio = getCurrentScrollRatio();
  const ok = await openAssociatedFile(resolved.path);
  if (!ok) return;

  if (currentPath && currentPath !== resolved.path) {
    pushDocHistory(currentPath, currentScrollRatio);
  }
  await restoreScrollRatio(0);
}

function revokeImageCropObjectUrl() {
  if (!imageCropObjectUrl.value) return;
  URL.revokeObjectURL(imageCropObjectUrl.value);
  imageCropObjectUrl.value = null;
}

function closeImageCropDialog() {
  imageCropOpen.value = false;
  imageCropTarget.value = null;
  imageCropPreviewSrc.value = "";
  revokeImageCropObjectUrl();
}

async function handleCropImageRequest(payload: PreviewImageCropPayload) {
  if (/\.svg(?:$|[?#])/i.test(payload.markdownSrc) || /\.svg$/i.test(payload.localPath ?? "")) {
    showToast("info", t("editor.imageCrop.svgUnsupported"));
    return;
  }

  if (isExternalImageSrc(payload.markdownSrc)) {
    if (!isImageHostingProviderConfigured(appPreferences.imageHosting)) {
      showToast("info", t("editor.imageCrop.uploadNotConfigured"));
      return;
    }

    try {
      const response = await fetch(payload.previewSrc);
      if (!response.ok) {
        throw new Error(`Failed to fetch image (${response.status}).`);
      }
      const blob = await response.blob();
      revokeImageCropObjectUrl();
      const objectUrl = URL.createObjectURL(blob);
      imageCropObjectUrl.value = objectUrl;
      imageCropPreviewSrc.value = objectUrl;
    } catch {
      showToast("error", t("editor.imageCrop.loadFailed"));
      return;
    }
  } else {
    revokeImageCropObjectUrl();
    const joiner = payload.previewSrc.includes("?") ? "&" : "?";
    imageCropPreviewSrc.value = `${payload.previewSrc}${joiner}crop=${Date.now()}`;
  }

  imageCropTarget.value = payload;
  imageCropOpen.value = true;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function handleImageCropConfirm(blob: Blob) {
  const target = imageCropTarget.value;
  if (!target) return;

  try {
    if (target.localPath && isTauri()) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(target.localPath, bytes);
      previewMediaEpoch.value += 1;
      closeImageCropDialog();
      showToast("success", t("editor.imageCrop.saved"));
      return;
    }

    if (isExternalImageSrc(target.markdownSrc)) {
      const mimeType = blob.type || mimeTypeFromPath(`image.${extensionFromSrc(target.markdownSrc)}`);
      const hosted = await uploadToConfiguredImageHost(appPreferences.imageHosting, {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        extension: extensionFromMimeType(mimeType),
        mimeType,
        sourceName: sourceNameFromSrc(target.markdownSrc),
      });
      const match = findImageBySrc(content.value, target.markdownSrc);
      if (!match) {
        showToast("error", t("editor.imageCrop.saveFailed"));
        return;
      }
      content.value = replaceImageSrc(content.value, match, hosted.src);
      previewMediaEpoch.value += 1;
      closeImageCropDialog();
      showToast("success", t("editor.imageCrop.saved"));
      return;
    }

    if (target.markdownSrc.startsWith("data:")) {
      const dataUrl = await blobToDataUrl(blob);
      const match = findImageBySrc(content.value, target.markdownSrc);
      if (!match) {
        showToast("error", t("editor.imageCrop.saveFailed"));
        return;
      }
      content.value = replaceImageSrc(content.value, match, dataUrl);
      closeImageCropDialog();
      showToast("success", t("editor.imageCrop.saved"));
      return;
    }

    showToast("error", t("editor.imageCrop.saveFailed"));
  } catch {
    showToast("error", t("editor.imageCrop.saveFailed"));
  }
}

const imageCropOutputMimeType = computed(() => {
  const target = imageCropTarget.value;
  if (!target) return "image/png";
  if (target.localPath) return mimeTypeFromPath(target.localPath);
  if (isExternalImageSrc(target.markdownSrc)) {
    return mimeTypeFromPath(`image.${extensionFromSrc(target.markdownSrc)}`);
  }
  return "image/png";
});

async function goBackDocument() {
  const previous = docHistory.value[docHistory.value.length - 1];
  if (!previous) return;

  const ok = await openAssociatedFile(previous.path);
  if (!ok) return;

  docHistory.value = docHistory.value.slice(0, -1);
  await restoreScrollRatio(previous.scrollRatio);
}

async function handleOpenedFiles(paths: string[]) {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return;

  const nextDocuments = workspaceDocuments.value.length > 1
    ? [...new Set([...workspaceDocuments.value, ...uniquePaths])]
    : uniquePaths;
  const targetPath = uniquePaths[0];

  if (targetPath !== filePath.value && !(await confirmDiscardChanges())) return;

  const opened = targetPath === filePath.value || await openFileAtPath(targetPath);
  if (!opened) {
    await message(t("app.fileReadError"), {
      title: t("app.title"),
      kind: "error",
    });
    return;
  }

  workspaceDocuments.value = nextDocuments;
  showStartPage.value = false;
  clearDocHistory();
}

async function switchWorkspaceDocument(path: string) {
  if (path === filePath.value) return;
  if (!(await confirmDiscardChanges())) return;

  const opened = await openFileAtPath(path);
  if (!opened) {
    workspaceDocuments.value = workspaceDocuments.value.filter((item) => item !== path);
    await message(t("app.fileReadError"), {
      title: t("app.title"),
      kind: "error",
    });
  }
}

function handleClearRecent() {
  clearRecent();
  recentFiles.value = [];
  void refreshRecentMenu([]);
}

function handleRemoveRecent(path: string) {
  recentFiles.value = removeRecent(path);
  void refreshRecentMenu(recentFiles.value);
}

let unlistenOpened: UnlistenFn | null = null;
let unlistenDragDrop: UnlistenFn | null = null;
let unlistenWindowFocus: UnlistenFn | null = null;

const showEditor = computed(() => viewMode.value !== "preview");
const showPreview = computed(() => viewMode.value !== "edit");
const showEditorFormatBar = computed(
  () =>
    showEditor.value &&
    !zenMode.value &&
    appPreferences.markdownFormatBarEnabled &&
    !previewingDiffItem.value,
);
const previewSearchCountText = computed(() => {
  if (previewMatchTotal.value === 0) return t("search.noMatch");
  const current = previewMatchCurrent.value > 0 ? previewMatchCurrent.value : 0;
  return t("search.matchCount", { current, total: previewMatchTotal.value });
});

function onPreviewSearchStats(stats: { current: number; total: number }) {
  previewMatchCurrent.value = stats.current;
  previewMatchTotal.value = stats.total;
}

function selectedSearchSeed() {
  const selected = window.getSelection()?.toString() ?? "";
  if (selected && !/[\n\r]/.test(selected) && selected.length <= 200) {
    return selected;
  }
  return "";
}

function closePreviewSearch() {
  previewSearchOpen.value = false;
  previewSearchText.value = "";
  previewMatchTotal.value = 0;
  previewMatchCurrent.value = 0;
}

function openPreviewSearch() {
  const alreadyOpen = previewSearchOpen.value;
  previewSearchOpen.value = true;
  if (!alreadyOpen) {
    const seed = selectedSearchSeed();
    if (seed) previewSearchText.value = seed;
  }

  void nextTick(() => {
    previewSearchReplaceRef.value?.focusSearch();
    if (!previewSearchText.value) return;
    if (alreadyOpen) previewRef.value?.findNextSearchMatch();
  });
}

function enterZen(target: "edit" | "preview") {
  if (!zenMode.value) {
    zenRestoreViewMode.value = viewMode.value;
  }
  zenMode.value = true;
  viewMode.value = target;
}

function exitZen() {
  if (!zenMode.value) return;
  zenMode.value = false;
  if (zenRestoreViewMode.value) {
    viewMode.value = zenRestoreViewMode.value;
  }
  zenRestoreViewMode.value = null;
}

function toggleZen(target: "edit" | "preview") {
  if (zenMode.value && viewMode.value === target) {
    exitZen();
    return;
  }
  enterZen(target);
}

watch(viewMode, (mode) => {
  if (mode === "preview") {
    editorRef.value?.closeSearch();
    return;
  }
  closePreviewSearch();
});

watch(
  [showOutline, viewMode],
  () => {
    if (!showOutline.value) return;
    void nextTick(() => {
      if (showEditor.value) syncOutlineFromEditor(true);
      else syncOutlineFromPreview();
    });
  },
  { immediate: true },
);

watch(aiDocumentKey, () => {
  outlineSourceLine.value = 0;
});

function isScrollAtStart(ratio: number) {
  return ratio <= 0.001;
}

function isScrollAtEnd(ratio: number) {
  return ratio >= 0.999;
}

function scrollElementToRatio(el: HTMLElement, ratio: number) {
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = max <= 0 ? 0 : max * ratio;
}

function releaseScrollSyncLock() {
  // CodeMirror and the preview both emit follow-up scroll events after layout settles.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSyncing = false;
    });
  });
}

function onEditorScroll() {
  if (showOutline.value) syncOutlineFromEditor(false);
  if (scrollSyncing || viewMode.value !== "split") return;
  lastScrollSource = "editor";
  const anchor = editorRef.value?.getScrollAnchor();
  const ratio = editorRef.value?.getScrollRatio() ?? 0;
  scrollSyncing = true;
  const el = previewPaneRef.value;
  if (el) {
    if (isScrollAtStart(ratio) || isScrollAtEnd(ratio)) {
      scrollElementToRatio(el, isScrollAtStart(ratio) ? 0 : 1);
    } else {
      const synced = anchor
        ? previewRef.value?.scrollToSourceAnchor(anchor, el)
        : false;
      if (!synced) scrollElementToRatio(el, ratio);
    }
  }
  releaseScrollSyncLock();
}

function onPreviewScroll(e: Event) {
  if (showOutline.value) syncOutlineFromPreview(e.target as HTMLElement);
  if (scrollSyncing || viewMode.value !== "split") return;
  lastScrollSource = "preview";
  const el = e.target as HTMLElement;
  const anchor = previewRef.value?.getScrollAnchor(el);
  const max = el.scrollHeight - el.clientHeight;
  const ratio = max <= 0 ? 0 : el.scrollTop / max;
  scrollSyncing = true;
  if (isScrollAtStart(ratio) || isScrollAtEnd(ratio)) {
    editorRef.value?.scrollRatio(isScrollAtStart(ratio) ? 0 : 1);
  } else {
    const synced = anchor ? editorRef.value?.scrollToSourceAnchor(anchor) : false;
    if (!synced) editorRef.value?.scrollRatio(ratio);
  }
  releaseScrollSyncLock();
}

function handlePreviewLayoutChange() {
  if (scrollSyncing || viewMode.value !== "split" || lastScrollSource === "preview") return;
  const pane = previewPaneRef.value;
  const anchor = editorRef.value?.getScrollAnchor();
  if (!pane || !anchor) return;

  scrollSyncing = true;
  if (isScrollAtStart(anchor.absoluteRatio) || isScrollAtEnd(anchor.absoluteRatio)) {
    scrollElementToRatio(pane, isScrollAtStart(anchor.absoluteRatio) ? 0 : 1);
  } else {
    previewRef.value?.scrollToSourceAnchor(anchor, pane);
  }
  releaseScrollSyncLock();
}

function beginSplitResize(event: PointerEvent) {
  if (viewMode.value !== "split") return;

  const workspace = workspaceRef.value;
  const editorPane = workspace?.querySelector<HTMLElement>(".pane-editor");
  const previewPane = workspace?.querySelector<HTMLElement>(".pane-preview");
  if (!editorPane || !previewPane) return;

  event.preventDefault();
  splitResizeStartX = event.clientX;
  splitResizeStartPercent = splitEditorPercent.value;
  splitResizeTotalWidth =
    editorPane.getBoundingClientRect().width +
    previewPane.getBoundingClientRect().width;
  isSplitResizing.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handleSplitResize);
  window.addEventListener("pointerup", stopSplitResize, { once: true });
}

function handleSplitResize(event: PointerEvent) {
  if (!isSplitResizing.value || splitResizeTotalWidth <= 0) return;

  const deltaPercent = ((event.clientX - splitResizeStartX) / splitResizeTotalWidth) * 100;
  setSplitEditorPercent(splitResizeStartPercent + deltaPercent, false);
}

function stopSplitResize() {
  if (!isSplitResizing.value) return;

  isSplitResizing.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", handleSplitResize);
  setSplitEditorPercent(splitEditorPercent.value);
}

function handleSplitResizeKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

  event.preventDefault();
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const multiplier = event.shiftKey ? 5 : 1;
  setSplitEditorPercent(
    splitEditorPercent.value + direction * SPLIT_KEYBOARD_STEP * multiplier,
  );
}

async function handleExportPdf() {
  if (exportingPdf.value) return;

  exportingPdf.value = true;
  exportPdfStage.value = "rendering";
  try {
    const result = await exportPdf(content.value, fileName.value, filePath.value, {
      onStage: (stage) => {
        exportPdfStage.value = stage;
      },
    });

    if (result.status === "success") {
      if (isTauri()) {
        showToast("success", t("app.pdfExported", { fileName: result.fileName }));
      } else {
        showToast("info", t("app.pdfPrintHint"));
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : t("app.pdfExportFailed");
    showToast("error", msg);
  } finally {
    exportingPdf.value = false;
  }
}

async function handleCopyWechatHtml() {
  if (exporting.value || exportingPdf.value) return;

  exporting.value = true;
  try {
    const html = await buildWechatHtmlForCopy(
      content.value,
      "classic",
      filePath.value,
      isDark.value,
    );
    const result = await copyWechatHtml(html);
    if (!result.ok) {
      await message(result.message, { title: t("app.title"), kind: "error" });
    }
  } finally {
    exporting.value = false;
  }
}

function formatChineseEnglishSpacing() {
  if (showStartPage.value) return;

  const formatted = applyChineseEnglishSpacingToMarkdownSource(content.value);
  if (formatted === content.value) {
    showToast("info", t("app.spacingNothingToFormat"));
    return;
  }

  if (editorRef.value) {
    editorRef.value.applyChanges([
      { from: 0, to: content.value.length, insert: formatted },
    ]);
  } else {
    content.value = formatted;
  }
  showToast("success", t("app.spacingFormatted"));
}

function openFormatBarSettings() {
  settingsInitialTab.value = "formatBar";
  showSettings.value = true;
}

function applyAIChanges(changes: EditChange[]) {
  editorRef.value?.applyChanges(changes);
}

function handlePreviewDiff(item: AIHistoryItem | null) {
  previewingDiffItem.value = item;
}

function handleAcceptPreview(item: AIHistoryItem) {
  const labelBase = item.instruction.trim().slice(0, 24) || t("ai.editLabel");
  const nextDoc = applyChangesToDoc(content.value, item.changes);
  
  editorRef.value?.applyChanges(item.changes);
  
  item.status = "applied";
  item.resultDoc = nextDoc;
  
  documentVersions.addChangeSnapshots(
    t("version.beforeChange", { label: labelBase }),
    t("version.afterChange", { label: labelBase }),
    content.value,
    nextDoc,
  );
  
  previewingDiffItem.value = null;
}

function handleDiscardPreview() {
  previewingDiffItem.value = null;
}

function handleAddSelectionContext(context: { text: string; from: number; to: number }) {
  pendingAiContext.value = {
    ...context,
    documentPath: filePath.value,
  };
  showAI.value = true;
  showToast("success", t("ai.contextAdded"));
}

function clearPendingAiContext() {
  pendingAiContext.value = null;
}

function clearProofreadIssues() {
  proofreadIssues.value = [];
  currentProofreadItemId.value = null;
  activeProofreadIssueId.value = null;
}

function handleProofreadIssues(issues: ProofreadIssue[], itemId: string) {
  proofreadIssues.value = issues.map((issue) => ({ ...issue, status: "pending" }));
  currentProofreadItemId.value = itemId;
  activeProofreadIssueId.value = proofreadIssues.value[0]?.id ?? null;
  if (activeProofreadIssueId.value) {
    void nextTick(() => editorRef.value?.revealProofreadIssue(activeProofreadIssueId.value!));
  }
}

function handleProofreadSelect(issueId: string) {
  activeProofreadIssueId.value = issueId;
}

function handleProofreadNavigate(issueId: string) {
  activeProofreadIssueId.value = issueId;
  void nextTick(() => editorRef.value?.revealProofreadIssue(issueId));
}

function resolveProofreadRange(issue: ProofreadIssue): { from: number; to: number } | null {
  if (content.value.slice(issue.from, issue.to) === issue.original) {
    return { from: issue.from, to: issue.to };
  }

  if (issue.context) {
    const contextFrom = content.value.indexOf(issue.context);
    const local = issue.context.indexOf(issue.original);
    if (contextFrom >= 0 && local >= 0) {
      const from = contextFrom + local;
      return { from, to: from + issue.original.length };
    }
  }

  const from = content.value.indexOf(issue.original);
  return from >= 0 ? { from, to: from + issue.original.length } : null;
}

function setActiveProofreadIssueAfterHandling(issueId: string) {
  const currentIndex = proofreadIssues.value.findIndex((issue) => issue.id === issueId);
  const nextIssue =
    proofreadIssues.value.slice(currentIndex + 1).find((issue) => issue.status !== "applied" && issue.status !== "ignored") ??
    [...proofreadIssues.value].slice(0, currentIndex).reverse().find((issue) => issue.status !== "applied" && issue.status !== "ignored") ??
    null;
  activeProofreadIssueId.value = nextIssue?.id ?? null;
}

function handleProofreadApply(issueId: string) {
  const issue = proofreadIssues.value.find((item) => item.id === issueId);
  if (!issue) return;

  const range = resolveProofreadRange(issue);
  if (!range) {
    showToast("error", t("proofread.issueNotFound"));
    handleProofreadDismiss(issueId);
    return;
  }

  const delta = issue.suggestion.length - (range.to - range.from);
  const previousContent = content.value;
  const nextContent = `${previousContent.slice(0, range.from)}${issue.suggestion}${previousContent.slice(range.to)}`;
  documentVersions.addChangeSnapshots(
    t("version.beforeChange", { label: t("proofread.fixLabel") }),
    t("version.afterChange", { label: t("proofread.fixLabel") }),
    previousContent,
    nextContent,
  );

  preserveProofreadIssuesOnNextContentChange = true;
  editorRef.value?.applyChanges([
    { from: range.from, to: range.to, insert: issue.suggestion },
  ]);

  proofreadIssues.value = proofreadIssues.value
    .map((item) => {
      if (item.id === issueId) {
        return { ...item, status: "applied" as const };
      }
      if (item.status === "applied" || item.status === "ignored") return item;
      if (item.from < range.to && item.to > range.from) {
        return { ...item, status: "ignored" as const };
      }
      if (item.from >= range.to) {
        return { ...item, from: item.from + delta, to: item.to + delta };
      }
      return item;
    });
  setActiveProofreadIssueAfterHandling(issueId);
}

function handleProofreadDismiss(issueId: string) {
  proofreadIssues.value = proofreadIssues.value.map((issue) =>
    issue.id === issueId ? { ...issue, status: "ignored" } : issue,
  );
  setActiveProofreadIssueAfterHandling(issueId);
}

function openVersionHistory() {
  const latestVersion = documentVersionList.value[0];
  if (!latestVersion) {
    showToast("info", t("app.noVersions"));
    return;
  }
  activeVersionId.value = latestVersion.id;
  showVersionHistory.value = true;
}

function closeVersionHistory() {
  showVersionHistory.value = false;
  activeVersionId.value = null;
}

function restoreDocumentVersion(versionContent: string) {
  content.value = versionContent;
  closeVersionHistory();
}

function navigateToHeading(item: OutlineItem) {
  setOutlineSourceLine(item.line);
  scrollSyncing = true;

  if (showEditor.value) {
    editorRef.value?.scrollToLine(item.line);
  }

  if (showPreview.value) {
    const pane = previewPaneRef.value;
    const article = previewRef.value?.articleEl;
    const heading = article?.querySelector(`#${CSS.escape(item.id)}`) as HTMLElement | null;
    if (pane && heading) {
      const top =
        heading.getBoundingClientRect().top -
        pane.getBoundingClientRect().top +
        pane.scrollTop -
        24;
      pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSyncing = false;
    });
  });
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (imageCropOpen.value) {
      closeImageCropDialog();
      return;
    }
    if (!showStartPage.value && previewSearchOpen.value) {
      closePreviewSearch();
      return;
    }
    if (!showStartPage.value && editorRef.value?.isSearchOpen()) {
      editorRef.value.closeSearch();
      return;
    }
    if (zenMode.value) {
      exitZen();
      return;
    }
    if (showSettings.value) {
      showSettings.value = false;
      return;
    }
    if (showAbout.value) {
      showAbout.value = false;
      return;
    }
  }

  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  if (e.key === "f" && !e.shiftKey && !showStartPage.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (viewMode.value === "preview") openPreviewSearch();
    else editorRef.value?.openSearch();
    return;
  }

  if (e.key === "h" && !e.shiftKey && !showStartPage.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (viewMode.value === "preview") openPreviewSearch();
    else editorRef.value?.openReplace();
    return;
  }

  if (e.key === "s") {
    e.preventDefault();
    if (e.shiftKey) saveFileAs(content.value);
    else saveFile(content.value);
  } else if (e.key === " " && e.shiftKey && !showStartPage.value) {
    e.preventDefault();
    formatChineseEnglishSpacing();
  } else if (e.key === "n" && !e.shiftKey) {
    e.preventDefault();
    void newFileWithConfirm();
  } else if (e.key === "o") {
    e.preventDefault();
    void openFileWithConfirm();
  } else if (e.key === "w" && !e.shiftKey && !showStartPage.value) {
    e.preventDefault();
    void closeCurrentDocument();
  } else if (e.key === "[" && canGoBack.value) {
    e.preventDefault();
    void goBackDocument();
  } else if (e.key === ",") {
    e.preventDefault();
    settingsInitialTab.value = "appearance";
    showSettings.value = true;
  } else if (e.key === "a" && e.shiftKey) {
    e.preventDefault();
    showAI.value = !showAI.value;
  }
}

const appMenuHandlers: AppMenuHandlers = {
  onNew: () => void newFileWithConfirm(),
  onOpen: () => void openFileWithConfirm(),
  onOpenRecent: (path) => void openRecentFile(path),
  onSave: () => void saveFile(content.value),
  onSaveAs: () => void saveFileAs(content.value),
  onClose: () => void closeCurrentDocument(),
  onFormatSpacing: formatChineseEnglishSpacing,
  onExportPdf: () => void handleExportPdf(),
  onCopyWechatHtml: () => void handleCopyWechatHtml(),
  onOpenSettings: () => {
    settingsInitialTab.value = "appearance";
    showSettings.value = true;
  },
  onOpenAbout: () => {
    showAbout.value = true;
  },
  onCheckForUpdates: updatesEnabled
    ? () => {
        void checkForUpdates({ manual: true });
      }
    : undefined,
  onClearRecent: handleClearRecent,
};

async function refreshAppMenu() {
  if (!hasTauriRuntime()) return;
  await setupAppMenu(appMenuHandlers);
  await refreshRecentMenu(recentFiles.value);
}

watch(locale, () => {
  void refreshAppMenu();
});

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown, true);

  if (hasTauriRuntime()) {
    await refreshAppMenu();

    unlistenWindowFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) void checkCurrentFileForExternalChanges();
    });

    const pending = await invoke<string[]>("take_opened_files");
    if (pending.length > 0) {
      await handleOpenedFiles(pending);
    }

    unlistenOpened = await listen<string[]>("opened", (event) => {
      void handleOpenedFiles(event.payload);
    });

    try {
      unlistenDragDrop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;

        const imagePaths = filterImagePaths(event.payload.paths);
        const documentSources = event.payload.paths.filter(
          (path) => !imagePaths.includes(path),
        );

        if (imagePaths.length > 0) {
          void handleDroppedImagePaths(imagePaths);
        }

        if (documentSources.length > 0) {
          void invoke("open_dropped_files", { paths: documentSources });
        }
      });
    } catch (error) {
      console.warn("Drag-and-drop listener unavailable in this environment:", error);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown, true);
  window.removeEventListener("pointermove", handleSplitResize);
  window.removeEventListener("pointerup", stopSplitResize);
  if (isSplitResizing.value) {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
  unlistenOpened?.();
  unlistenDragDrop?.();
  unlistenWindowFocus?.();
});
</script>

<template>
  <div class="app">
    <Toolbar
      v-if="!showStartPage && !zenMode"
      class="editor-enter"
      :file-name="fileName"
      :file-path="filePath"
      :is-dirty="isDirty"
      :view-mode="viewMode"
      :is-dark="isDark"
      :exporting="exportingPdf"
      :show-outline="showOutline"
      :show-export="showExport"
      :show-a-i="showAI"
      :show-versions="showVersionHistory"
      :has-versions="documentVersionList.length > 0"
      @new-doc="newFileWithConfirm"
      @open="openFileWithConfirm"
      @save="saveFile(content)"
      @close-doc="closeCurrentDocument"
      @reveal-in-folder="revealCurrentFileInFolder"
      @export-pdf="handleExportPdf"
      @toggle-theme="toggleTheme"
      @toggle-outline="showOutline = !showOutline"
      @open-export="showExport = true"
      @toggle-a-i="showAI = !showAI"
      @toggle-versions="openVersionHistory"
      @update:view-mode="viewMode = $event"
    />

    <SettingsPanel
      :open="showSettings"
      :initial-tab="settingsInitialTab"
      :app-version="appVersion"
      :updates-enabled="updatesEnabled"
      :on-check-for-updates="() => checkForUpdates({ manual: true })"
      @close="showSettings = false"
    />
    <AboutPanel :open="showAbout" @close="showAbout = false" />

    <UpdateDialog
      :open="updateDialogOpen"
      :version="pendingUpdate?.version ?? ''"
      @confirm="confirmPendingUpdate"
      @cancel="dismissPendingUpdate"
    />

    <ImageCropDialog
      :open="imageCropOpen"
      :image-src="imageCropPreviewSrc"
      :output-mime-type="imageCropOutputMimeType"
      @close="closeImageCropDialog"
      @confirm="handleImageCropConfirm"
    />

    <StartPage
      v-if="showStartPage"
      :recent-files="recentFiles"
      :recoverable-draft="recoverableDraft"
      @new-doc="newFileWithConfirm"
      @open="openFileWithConfirm"
      @open-recent="openRecentFile"
      @remove-recent="handleRemoveRecent"
      @clear-recent="handleClearRecent"
      @recover-draft="recoverUnsavedDraft"
      @discard-draft="discardUnsavedDraft"
    />

    <div
      v-else
      ref="workspaceRef"
      class="workspace editor-enter"
      :class="[
        `mode-${viewMode}`,
        {
          'is-split-resizing': isSplitResizing,
          'has-editor-format-bar': showEditorFormatBar,
          'is-zen': zenMode,
        },
      ]"
      :style="splitLayoutStyle"
    >
      <DocumentSwitcher
        v-if="workspaceDocuments.length > 1 && !zenMode"
        :paths="workspaceDocuments"
        :active-path="filePath"
        @select="switchWorkspaceDocument"
      />

      <button
        v-if="canGoBack && !zenMode"
        class="doc-back"
        :title="t('app.backToPreviousDocTitle')"
        @click="goBackDocument"
      >
        <span class="doc-back-arrow">←</span>
        <span>{{ t("app.backToPreviousDoc") }}</span>
      </button>

      <section v-show="showEditor" class="pane pane-editor">
        <div v-if="viewMode !== 'split'" class="pane-chrome pane-chrome--editor">
          <PaneZenButton
            :active="zenMode && viewMode === 'edit'"
            @toggle="toggleZen('edit')"
          />
        </div>
        <MarkdownEditor
          ref="editorRef"
          v-model="content"
          :document-path="filePath"
          :ensure-document-saved="ensureDocumentSavedForImage"
          :proofread-issues="proofreadIssues"
          :active-proofread-issue-id="activeProofreadIssueId"
          :preview-diff-item="previewingDiffItem"
          :format-bar-enabled="appPreferences.markdownFormatBarEnabled && !zenMode"
          :format-bar-tools="appPreferences.markdownFormatBarTools"
          :format-bar-tool-order="appPreferences.markdownFormatBarToolOrder"
          :image-hosting="appPreferences.imageHosting"
          :needs-format-spacing="needsFormatSpacing"
          @scroll="onEditorScroll"
          @position-change="onEditorPositionChange"
          @add-selection-context="handleAddSelectionContext"
          @format-spacing="formatChineseEnglishSpacing"
          @open-format-settings="openFormatBarSettings"
          @proofread-select="handleProofreadSelect"
          @proofread-apply="handleProofreadApply"
          @proofread-dismiss="handleProofreadDismiss"
          @accept-preview="handleAcceptPreview"
          @discard-preview="handleDiscardPreview"
        />
      </section>

      <div
        v-if="viewMode === 'split'"
        class="divider split-resize-handle"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('editor.resizeSplit')"
        :aria-valuemin="MIN_SPLIT_PANE_PERCENT"
        :aria-valuemax="100 - MIN_SPLIT_PANE_PERCENT"
        :aria-valuenow="Math.round(splitEditorPercent)"
        :title="t('editor.resizeSplitTitle')"
        @pointerdown="beginSplitResize"
        @keydown="handleSplitResizeKeydown"
      />

      <section
        v-show="showPreview"
        class="pane pane-preview"
      >
        <div class="pane-chrome">
          <EditorSearchReplace
            v-if="previewSearchOpen"
            ref="previewSearchReplaceRef"
            v-model:search-text="previewSearchText"
            replace-text=""
            v-model:case-sensitive="previewSearchCaseSensitive"
            :replace-open="false"
            embedded
            :allow-replace="false"
            :search-count-text="previewSearchCountText"
            :has-matches="previewMatchTotal > 0"
            @find-next="previewRef?.findNextSearchMatch()"
            @find-previous="previewRef?.findPreviousSearchMatch()"
            @close="closePreviewSearch"
          />
          <PaneZenButton
            v-if="viewMode !== 'split'"
            :active="zenMode && viewMode === 'preview'"
            @toggle="toggleZen('preview')"
          />
        </div>
        <div
          ref="previewPaneRef"
          class="pane-preview-scroll"
          @scroll="onPreviewScroll"
        >
          <MarkdownPreview
            ref="previewRef"
            :source="content"
            :doc-file-path="filePath"
            :media-epoch="previewMediaEpoch"
            :search-open="previewSearchOpen"
            :search-text="previewSearchText"
            :search-case-sensitive="previewSearchCaseSensitive"
            @open-link="handleOpenLink"
            @crop-image="handleCropImageRequest"
            @layout-change="handlePreviewLayoutChange"
            @search-stats="onPreviewSearchStats"
          />
        </div>
      </section>

      <AIPanel
        v-if="showAI && !zenMode"
        :doc="content"
        :document-key="aiDocumentKey"
        :document-path="filePath"
        :workspace-paths="workspaceDocuments.length > 1 ? workspaceDocuments : recentFiles"
        :read-workspace-file="readAiWorkspaceFile"
        :pending-context="pendingAiContext"
        :proofread-issues="proofreadIssues"
        :current-proofread-item-id="currentProofreadItemId"
        :active-proofread-issue-id="activeProofreadIssueId"
        :previewing-diff-item-id="previewingDiffItem?.id"
        @apply="applyAIChanges"
        @clear-context="clearPendingAiContext"
        @proofread="handleProofreadIssues"
        @proofread-navigate="handleProofreadNavigate"
        @proofread-apply="handleProofreadApply"
        @proofread-dismiss="handleProofreadDismiss"
        @restore="restoreDocumentVersion"
        @preview="handlePreviewDiff"
      />

      <OutlinePanel
        v-if="showOutline && !zenMode"
        :items="outlineItems"
        :active-id="activeOutlineId"
        @navigate="navigateToHeading"
      />

    </div>

    <ExportStudio
      v-if="showExport && !showStartPage"
      v-model="content"
      :file-name="fileName"
      :doc-file-path="filePath"
      :is-dark="isDark"
      @close="showExport = false"
    />

    <AIVersionViewer
      v-if="showVersionHistory && activeVersionId"
      :versions="documentVersionList"
      :active-id="activeVersionId"
      :current-doc="content"
      @update:active-id="activeVersionId = $event"
      @close="closeVersionHistory"
      @restore="restoreDocumentVersion"
    />

    <Teleport to="body">
      <div
        v-if="exportingPdf"
        class="export-pdf-overlay"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="export-pdf-card">
          <span class="export-pdf-spinner" aria-hidden="true" />
          <p class="export-pdf-text">{{ exportPdfLoadingText }}</p>
        </div>
      </div>
    </Teleport>

    <AppToast />
  </div>
</template>

<style scoped>
@keyframes editor-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.editor-enter {
  animation: editor-fade-in 0.32s ease-out both;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ink-bg);
}

.workspace {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.doc-back {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  color: var(--ink-text);
  font-size: 13px;
  line-height: 1;
  background: color-mix(in srgb, var(--ink-surface) 88%, transparent);
  border: 1px solid var(--ink-border);
  border-radius: 999px;
  box-shadow: 0 8px 24px var(--ink-shadow);
  transform: translateX(-50%);
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s;
}

.doc-back:hover {
  background: var(--ink-surface);
  border-color: var(--ink-border-strong);
  transform: translateX(-50%) translateY(-1px);
}

.workspace.has-editor-format-bar .doc-back {
  top: 56px;
}

.doc-back-arrow {
  color: var(--ink-text-muted);
}

.pane {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.mode-edit .pane-editor {
  flex: 1;
}

.mode-split .pane-editor {
  flex: var(--editor-pane-grow, 50) 1 0;
}

.mode-split .pane-preview {
  flex: var(--preview-pane-grow, 50) 1 0;
}

.mode-preview .pane-preview {
  flex: 1;
}

.divider {
  position: relative;
  width: 11px;
  margin: 0 -5px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  z-index: 15;
  touch-action: none;
}

.divider::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 1px;
  background: var(--ink-border-strong);
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.split-resize-handle:hover::before,
.split-resize-handle:focus-visible::before,
.workspace.is-split-resizing .split-resize-handle::before {
  background: var(--ink-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink-accent) 24%, transparent);
}

.split-resize-handle:focus-visible {
  outline: none;
}

.workspace.is-split-resizing .pane {
  user-select: none;
  pointer-events: none;
}

.pane-preview {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.pane-chrome {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 12;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100% - 32px);
  pointer-events: none;
  -webkit-app-region: no-drag;
}

.pane-chrome > * {
  pointer-events: auto;
}

.workspace.has-editor-format-bar .pane-chrome--editor {
  top: 54px;
}

.mode-edit .pane-editor :deep(.editor-chrome) {
  right: 56px;
  max-width: calc(100% - 4.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .editor-enter {
    animation: none;
  }

  .export-pdf-spinner {
    animation: none;
    border-top-color: var(--ink-accent);
  }
}

.export-pdf-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--ink-bg) 55%, transparent);
  backdrop-filter: blur(2px);
}

.export-pdf-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-width: 220px;
  padding: 22px 28px;
  border-radius: 12px;
  border: 1px solid var(--ink-border-strong);
  background: var(--ink-surface);
  box-shadow: 0 16px 40px var(--ink-shadow);
}

.export-pdf-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--ink-border-strong);
  border-top-color: var(--ink-accent);
  border-radius: 50%;
  animation: export-pdf-spin 0.8s linear infinite;
}

.export-pdf-text {
  margin: 0;
  font-size: 13px;
  color: var(--ink-text-muted);
}

@keyframes export-pdf-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
