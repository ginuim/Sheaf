<script setup lang="ts">
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AppToast from "./components/AppToast.vue";
import AIPanel from "./components/AIPanel.vue";
import AIVersionViewer from "./components/AIVersionViewer.vue";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import MarkdownPreview from "./components/MarkdownPreview.vue";
import ExportStudio from "./components/ExportStudio.vue";
import OutlinePanel from "./components/OutlinePanel.vue";
import AboutPanel from "./components/AboutPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import StartPage from "./components/StartPage.vue";
import Toolbar from "./components/Toolbar.vue";
import type { ViewMode } from "./components/Toolbar.vue";
import type { EditChange } from "./composables/useAI";
import { migrateAiHistoryKey } from "./composables/useAI";
import type { ProofreadIssue } from "./types/proofreading";
import { migrateDocumentVersionsKey, useDocumentVersions } from "./composables/useDocumentVersions";
import { refreshRecentMenu, setupAppMenu, type AppMenuHandlers } from "./composables/useAppMenu";
import { exportPdf, type ExportPdfStage } from "./composables/usePdfExport";
import { useAppToast } from "./composables/useAppToast";
import { buildWechatHtmlForCopy, copyWechatHtml } from "./composables/useWechatExport";
import { resolveLinkHref } from "./composables/resolveMediaSrc";
import { useFile } from "./composables/useFile";
import { parseOutline, type OutlineItem } from "./composables/useOutline";
import {
  addRecent,
  clearRecent,
  loadRecent,
  removeRecent,
} from "./composables/useRecentFiles";
import { useTheme } from "./composables/useTheme";
import { translate, useLocale } from "./composables/useLocale";
import { applyChineseEnglishSpacingToMarkdownSource } from "./lib/cjkSpacing";
import { filterDocumentPaths, filterImagePaths } from "./lib/dropped-paths";
import {
  clearUnsavedDraft,
  hasRecoverableDraft,
  loadUnsavedDraft,
  saveUnsavedDraft,
  type UnsavedDraft
} from "./composables/useDraftRecovery";

const DEFAULT_CONTENT = translate("app.defaultContent");

const { t, locale } = useLocale();
const content = ref(DEFAULT_CONTENT);
const baselineContent = ref(DEFAULT_CONTENT);
const isDirty = computed(() => content.value !== baselineContent.value);
const viewMode = ref<ViewMode>("split");
const showOutline = ref(parseOutline(DEFAULT_CONTENT).length > 0);
const showExport = ref(false);
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const previewRef = ref<InstanceType<typeof MarkdownPreview> | null>(null);
const previewPaneRef = ref<HTMLElement | null>(null);
const exporting = ref(false);
const exportingPdf = ref(false);
const exportPdfStage = ref<ExportPdfStage>("rendering");
const { showToast } = useAppToast();
const exportPdfLoadingText = computed(() =>
  exportPdfStage.value === "rendering" ? t("app.renderingDoc") : t("app.generatingPdf"),
);
const showSettings = ref(false);
const showAbout = ref(false);
const showAI = ref(false);
const showVersionHistory = ref(false);
const activeVersionId = ref<string | null>(null);
const proofreadIssues = ref<ProofreadIssue[]>([]);
const currentProofreadItemId = ref<string | null>(null);
const activeProofreadIssueId = ref<string | null>(null);
const showStartPage = ref(true);
const recentFiles = ref<string[]>(loadRecent());
const pendingDraft = ref<UnsavedDraft | null>(loadUnsavedDraft());
const recoverableDraft = computed(() =>
  hasRecoverableDraft(pendingDraft.value) ? pendingDraft.value : null
);
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;
let scrollSyncing = false;
let preserveProofreadIssuesOnNextContentChange = false;

type DocHistoryEntry = {
  path: string;
  scrollRatio: number;
};

const MAX_DOC_HISTORY = 20;
const docHistory = ref<DocHistoryEntry[]>([]);
const canGoBack = computed(() => docHistory.value.length > 0);

function createDraftSessionId() {
  return `draft:${crypto.randomUUID()}`;
}

const draftSessionId = ref(createDraftSessionId());

const outlineItems = computed(() => parseOutline(content.value));

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

const { filePath, fileName, openFile, openFileAtPath, newFile, saveFile, saveFileAs, restoreFileState } =
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
    filePath: draft.filePath
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

async function confirmDiscardChanges(): Promise<boolean> {
  if (!isDirty.value) return true;
  return ask(t("app.unsavedChanges"), {
    title: t("app.title"),
    kind: "warning",
  });
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

async function goBackDocument() {
  const previous = docHistory.value[docHistory.value.length - 1];
  if (!previous) return;

  const ok = await openAssociatedFile(previous.path);
  if (!ok) return;

  docHistory.value = docHistory.value.slice(0, -1);
  await restoreScrollRatio(previous.scrollRatio);
}

async function handleOpenedFiles(paths: string[]) {
  let opened = false;
  for (const path of paths) {
    opened = (await openAssociatedFile(path)) || opened;
  }
  if (opened) {
    showStartPage.value = false;
    clearDocHistory();
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

const showEditor = computed(() => viewMode.value !== "preview");
const showPreview = computed(() => viewMode.value !== "edit");

function onEditorScroll() {
  if (scrollSyncing || viewMode.value !== "split") return;
  const ratio = editorRef.value?.getScrollRatio() ?? 0;
  scrollSyncing = true;
  const el = previewPaneRef.value;
  if (el) {
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = max * ratio;
  }
  // 预览区 scrollTop 被设置后，其 scroll 事件在下一帧 flush 阶段才派发，
  // 单层 rAF 释放锁时该事件可能还未到，需要双层 rAF 确保它先被拦截。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSyncing = false;
    });
  });
}

function onPreviewScroll(e: Event) {
  if (scrollSyncing || viewMode.value !== "split") return;
  const el = e.target as HTMLElement;
  const max = el.scrollHeight - el.clientHeight;
  const ratio = max <= 0 ? 0 : el.scrollTop / max;
  scrollSyncing = true;
  editorRef.value?.scrollRatio(ratio);
  // 用双重 rAF：CodeMirror 设置 scrollTop 后会在下一帧做行对齐微调，
  // 再触发一次 scroll 事件，必须等那次也结束后才能释放 flag，否则会抖动。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSyncing = false;
    });
  });
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

function applyAIChanges(changes: EditChange[]) {
  editorRef.value?.applyChanges(changes);
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
    if (!showStartPage.value && editorRef.value?.isSearchOpen()) {
      editorRef.value.closeSearch();
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
    editorRef.value?.openSearch();
    return;
  }

  if (e.key === "h" && !e.shiftKey && !showStartPage.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    editorRef.value?.openReplace();
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
  } else if (e.key === "[" && canGoBack.value) {
    e.preventDefault();
    void goBackDocument();
  } else if (e.key === ",") {
    e.preventDefault();
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
  onFormatSpacing: formatChineseEnglishSpacing,
  onExportPdf: () => void handleExportPdf(),
  onCopyWechatHtml: () => void handleCopyWechatHtml(),
  onOpenSettings: () => {
    showSettings.value = true;
  },
  onOpenAbout: () => {
    showAbout.value = true;
  },
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
        const documentPaths = filterDocumentPaths(event.payload.paths);

        if (imagePaths.length > 0) {
          void handleDroppedImagePaths(imagePaths);
        }

        if (documentPaths.length > 0) {
          void invoke("open_dropped_files", { paths: documentPaths });
        }
      });
    } catch (error) {
      console.warn("Drag-and-drop listener unavailable in this environment:", error);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown, true);
  unlistenOpened?.();
  unlistenDragDrop?.();
});
</script>

<template>
  <div class="app">
    <Toolbar
      v-if="!showStartPage"
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
      @reveal-in-folder="revealCurrentFileInFolder"
      @format-spacing="formatChineseEnglishSpacing"
      @export-pdf="handleExportPdf"
      @toggle-theme="toggleTheme"
      @toggle-outline="showOutline = !showOutline"
      @open-export="showExport = true"
      @toggle-a-i="showAI = !showAI"
      @toggle-versions="openVersionHistory"
      @update:view-mode="viewMode = $event"
    />

    <SettingsPanel :open="showSettings" @close="showSettings = false" />
    <AboutPanel :open="showAbout" @close="showAbout = false" />

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

    <div v-else class="workspace editor-enter" :class="`mode-${viewMode}`">
      <button
        v-if="canGoBack"
        class="doc-back"
        :title="t('app.backToPreviousDocTitle')"
        @click="goBackDocument"
      >
        <span class="doc-back-arrow">←</span>
        <span>{{ t("app.backToPreviousDoc") }}</span>
      </button>

      <section v-show="showEditor" class="pane pane-editor">
        <MarkdownEditor
          ref="editorRef"
          v-model="content"
          :document-path="filePath"
          :ensure-document-saved="ensureDocumentSavedForImage"
          :proofread-issues="proofreadIssues"
          :active-proofread-issue-id="activeProofreadIssueId"
          @scroll="onEditorScroll"
          @proofread-select="handleProofreadSelect"
          @proofread-apply="handleProofreadApply"
          @proofread-dismiss="handleProofreadDismiss"
        />
      </section>

      <div v-if="viewMode === 'split'" class="divider" aria-hidden="true" />

      <section
        v-show="showPreview"
        ref="previewPaneRef"
        class="pane pane-preview"
        @scroll="onPreviewScroll"
      >
        <MarkdownPreview
          ref="previewRef"
          :source="content"
          :doc-file-path="filePath"
          @open-link="handleOpenLink"
        />
      </section>

      <AIPanel
        v-if="showAI"
        :doc="content"
        :document-key="aiDocumentKey"
        :document-path="filePath"
        :workspace-paths="recentFiles"
        :read-workspace-file="readAiWorkspaceFile"
        :proofread-issues="proofreadIssues"
        :current-proofread-item-id="currentProofreadItemId"
        :active-proofread-issue-id="activeProofreadIssueId"
        @apply="applyAIChanges"
        @proofread="handleProofreadIssues"
        @proofread-navigate="handleProofreadNavigate"
        @proofread-apply="handleProofreadApply"
        @proofread-dismiss="handleProofreadDismiss"
        @restore="restoreDocumentVersion"
      />

      <OutlinePanel
        v-if="showOutline"
        :items="outlineItems"
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

.doc-back-arrow {
  color: var(--ink-text-muted);
}

.pane {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.mode-edit .pane-editor {
  flex: 1;
}

.mode-preview .pane-preview {
  flex: 1;
  overflow: auto;
}

.divider {
  width: 1px;
  background: var(--ink-border-strong);
  flex-shrink: 0;
}

.pane-preview {
  overflow: auto;
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
