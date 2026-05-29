<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { computed, onMounted, onUnmounted, ref } from "vue";
import AIPanel from "./components/AIPanel.vue";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import MarkdownPreview from "./components/MarkdownPreview.vue";
import ExportPanel from "./components/ExportPanel.vue";
import OutlinePanel from "./components/OutlinePanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import Toolbar from "./components/Toolbar.vue";
import type { ViewMode } from "./components/Toolbar.vue";
import type { EditChange } from "./composables/useAI";
import { refreshRecentMenu, setupAppMenu } from "./composables/useAppMenu";
import { exportPdf } from "./composables/usePdfExport";
import { buildWechatHtml, copyWechatHtml } from "./composables/useWechatExport";
import { useFile } from "./composables/useFile";
import { parseOutline, type OutlineItem } from "./composables/useOutline";
import {
  addRecent,
  clearRecent,
  loadRecent,
  removeRecent,
} from "./composables/useRecentFiles";
import { useTheme } from "./composables/useTheme";

const DEFAULT_CONTENT = `# 欢迎使用 Sheaf

一款注重排版与留白的 Markdown 编辑器。

## 开始写作

在左侧输入 Markdown，右侧实时预览渲染效果。

- **粗体** 与 *斜体*
- [链接](https://tauri.app)
- 行内 \`代码\`

> 好的排版让文字呼吸。
> 留白不是浪费，是给思考的空间。

\`\`\`javascript
const greeting = "Hello, Markdown";
console.log(greeting);
\`\`\`

---

用 **打开** 读取本地文件，**保存** 写入磁盘。`;

const content = ref(DEFAULT_CONTENT);
const baselineContent = ref(DEFAULT_CONTENT);
const isDirty = computed(() => content.value !== baselineContent.value);
const viewMode = ref<ViewMode>("split");
const showOutline = ref(true);
const showExport = ref(true);
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const previewRef = ref<InstanceType<typeof MarkdownPreview> | null>(null);
const previewPaneRef = ref<HTMLElement | null>(null);
const exporting = ref(false);
const showSettings = ref(false);
const showAI = ref(false);
let scrollSyncing = false;

const outlineItems = computed(() => parseOutline(content.value));

const { theme, toggleTheme } = useTheme();
const isDark = computed(() => theme.value === "dark");

function onPathOpened(path: string) {
  addRecent(path);
  void refreshRecentMenu(loadRecent());
}

const { filePath, fileName, openFile, openFileAtPath, saveFile, saveFileAs } =
  useFile(
    (loaded) => {
      content.value = loaded;
      baselineContent.value = loaded;
    },
    onPathOpened,
    () => {
      baselineContent.value = content.value;
    },
  );

async function confirmDiscardChanges(): Promise<boolean> {
  if (!isDirty.value) return true;
  return ask("当前文档有未保存的更改，是否继续？", {
    title: "Sheaf",
    kind: "warning",
  });
}

async function openFileWithConfirm() {
  if (!(await confirmDiscardChanges())) return;
  await openFile();
}

async function openRecentFile(path: string) {
  if (!(await confirmDiscardChanges())) return;

  const ok = await openFileAtPath(path);
  if (!ok) {
    removeRecent(path);
    await refreshRecentMenu(loadRecent());
    await message("文件不存在或无法读取。", {
      title: "Sheaf",
      kind: "error",
    });
  }
}

async function openAssociatedFile(path: string) {
  if (!(await confirmDiscardChanges())) return;

  const ok = await openFileAtPath(path);
  if (!ok) {
    await message("文件不存在或无法读取。", {
      title: "Sheaf",
      kind: "error",
    });
  }
}

async function handleOpenedFiles(paths: string[]) {
  for (const path of paths) {
    await openAssociatedFile(path);
  }
}

let unlistenOpened: UnlistenFn | null = null;

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
  if (exporting.value) return;

  exporting.value = true;
  try {
    await exportPdf(content.value, fileName.value, filePath.value);
  } finally {
    exporting.value = false;
  }
}

async function handleCopyWechatHtml() {
  if (exporting.value) return;

  exporting.value = true;
  try {
    const html = buildWechatHtml(content.value, "classic", filePath.value);
    const result = await copyWechatHtml(html);
    if (!result.ok) {
      await message(result.message, { title: "Sheaf", kind: "error" });
    }
  } finally {
    exporting.value = false;
  }
}

function applyAIChanges(changes: EditChange[]) {
  editorRef.value?.applyChanges(changes);
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
  if (e.key === "Escape" && showSettings.value) {
    showSettings.value = false;
    return;
  }

  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  if (e.key === "s") {
    e.preventDefault();
    if (e.shiftKey) saveFileAs(content.value);
    else saveFile(content.value);
  } else if (e.key === "o") {
    e.preventDefault();
    void openFileWithConfirm();
  } else if (e.key === ",") {
    e.preventDefault();
    showSettings.value = true;
  } else if (e.key === "a" && e.shiftKey) {
    e.preventDefault();
    showAI.value = !showAI.value;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);

  await setupAppMenu({
    onOpen: () => void openFileWithConfirm(),
    onOpenRecent: (path) => void openRecentFile(path),
    onSave: () => void saveFile(content.value),
    onSaveAs: () => void saveFileAs(content.value),
    onExportPdf: () => void handleExportPdf(),
    onCopyWechatHtml: () => void handleCopyWechatHtml(),
    onOpenSettings: () => {
      showSettings.value = true;
    },
    onClearRecent: () => {
      clearRecent();
      void refreshRecentMenu([]);
    },
  });
  await refreshRecentMenu(loadRecent());

  const pending = await invoke<string[]>("take_opened_files");
  if (pending.length > 0) {
    await handleOpenedFiles(pending);
  }

  unlistenOpened = await listen<string[]>("opened", (event) => {
    void handleOpenedFiles(event.payload);
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  unlistenOpened?.();
});
</script>

<template>
  <div class="app">
    <Toolbar
      :file-name="fileName"
      :is-dirty="isDirty"
      :view-mode="viewMode"
      :is-dark="isDark"
      :exporting="exporting"
      :show-outline="showOutline"
      :show-export="showExport"
      :show-a-i="showAI"
      @open="openFileWithConfirm"
      @save="saveFile(content)"
      @save-as="saveFileAs(content)"
      @export-pdf="handleExportPdf"
      @toggle-theme="toggleTheme"
      @toggle-outline="showOutline = !showOutline"
      @toggle-export="showExport = !showExport"
      @toggle-a-i="showAI = !showAI"
      @update:view-mode="viewMode = $event"
    />

    <SettingsPanel :open="showSettings" @close="showSettings = false" />

    <div class="workspace" :class="`mode-${viewMode}`">
      <section v-show="showEditor" class="pane pane-editor">
        <MarkdownEditor
          ref="editorRef"
          v-model="content"
          @scroll="onEditorScroll"
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
        />
      </section>

      <AIPanel
        v-if="showAI"
        :doc="content"
        @apply="applyAIChanges"
      />

      <OutlinePanel
        v-if="showOutline"
        :items="outlineItems"
        @navigate="navigateToHeading"
      />

      <ExportPanel
        v-if="showExport"
        :source="content"
        :doc-file-path="filePath"
      />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ink-bg);
}

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
</style>
