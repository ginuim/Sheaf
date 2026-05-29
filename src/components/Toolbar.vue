<script setup lang="ts">
export type ViewMode = "split" | "edit" | "preview";

defineProps<{
  fileName: string;
  isDirty: boolean;
  viewMode: ViewMode;
  isDark: boolean;
  exporting: boolean;
  showOutline: boolean;
  showExport: boolean;
  showAI: boolean;
}>();

const emit = defineEmits<{
  open: [];
  save: [];
  saveAs: [];
  exportPdf: [];
  toggleTheme: [];
  toggleOutline: [];
  toggleExport: [];
  toggleAI: [];
  "update:viewMode": [mode: ViewMode];
}>();

const modes: { id: ViewMode; label: string }[] = [
  { id: "split", label: "分屏" },
  { id: "edit", label: "编辑" },
  { id: "preview", label: "预览" },
];
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-left">
      <button class="btn" title="打开文件 (⌘O)" @click="emit('open')">
        打开
      </button>
      <button class="btn" title="保存 (⌘S)" @click="emit('save')">
        保存
      </button>
      <button class="btn btn-ghost" title="另存为" @click="emit('saveAs')">
        另存为
      </button>
      <button
        class="btn btn-ghost"
        title="导出 PDF"
        :disabled="exporting"
        @click="emit('exportPdf')"
      >
        {{ exporting ? "导出中…" : "导出 PDF" }}
      </button>
    </div>

    <div class="toolbar-center">
      <span class="doc-title">
        {{ fileName }}<span v-if="isDirty" class="dirty"> ·</span>
      </span>
    </div>

    <div class="toolbar-right">
      <button
        class="btn btn-ghost ai-toggle"
        :class="{ active: showAI }"
        title="AI 编辑 (⌘⇧A)"
        @click="emit('toggleAI')"
      >
        AI
      </button>
      <button
        class="btn btn-ghost export-toggle"
        :class="{ active: showExport }"
        title="导出面板"
        @click="emit('toggleExport')"
      >
        导出
      </button>
      <button
        class="btn btn-ghost outline-toggle"
        :class="{ active: showOutline }"
        title="章节大纲"
        @click="emit('toggleOutline')"
      >
        大纲
      </button>
      <button
        class="btn btn-icon"
        :title="isDark ? '切换浅色模式' : '切换暗色模式'"
        :aria-label="isDark ? '切换浅色模式' : '切换暗色模式'"
        @click="emit('toggleTheme')"
      >
        {{ isDark ? "☀" : "☾" }}
      </button>
      <div class="view-switch" role="group" aria-label="视图模式">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="view-btn"
          :class="{ active: viewMode === mode.id }"
          @click="emit('update:viewMode', mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 var(--space-md);
  background: var(--ink-surface);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  flex: 1;
}

.toolbar-center {
  justify-content: center;
}

.toolbar-right {
  justify-content: flex-end;
  gap: 8px;
}

.toolbar-left,
.toolbar-right {
  gap: 4px;
  -webkit-app-region: no-drag;
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-text);
  border-radius: 6px;
  transition: background 0.15s;
}

.btn:hover {
  background: var(--ink-accent-soft);
}

.btn-ghost {
  color: var(--ink-text-muted);
  font-weight: 400;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  border-radius: 6px;
}

.doc-title {
  font-size: 13px;
  color: var(--ink-text-muted);
  letter-spacing: 0.02em;
  user-select: none;
}

.dirty {
  color: var(--ink-accent);
  font-weight: 600;
}

.view-switch {
  display: flex;
  background: var(--ink-bg);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.view-btn {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text-muted);
  border-radius: 6px;
  transition: all 0.15s;
}

.view-btn:hover {
  color: var(--ink-text);
}

.view-btn.active {
  background: var(--ink-surface);
  color: var(--ink-text);
  box-shadow: 0 1px 3px var(--ink-shadow);
}

.outline-toggle.active,
.export-toggle.active,
.ai-toggle.active {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}
</style>
