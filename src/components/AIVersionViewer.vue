<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { compressDiff, lineDiff, type CompressedDiffLine } from "../composables/useAI";
import type { DocumentVersion } from "../composables/useDocumentVersions";

const props = defineProps<{
  versions: DocumentVersion[];
  activeId: string | null;
  currentDoc: string;
}>();

const emit = defineEmits<{
  close: [];
  restore: [content: string];
  "update:activeId": [id: string];
}>();

const viewMode = ref<"diff" | "preview">("diff");

const activeVersion = computed(
  () => props.versions.find((version) => version.id === props.activeId) ?? null
);

const activeIndex = computed(() =>
  props.versions.findIndex((version) => version.id === props.activeId)
);

const hasPrev = computed(() => activeIndex.value > 0);
const hasNext = computed(() => activeIndex.value >= 0 && activeIndex.value < props.versions.length - 1);

const previousVersion = computed(() => {
  if (!activeVersion.value) return null;
  if (typeof activeVersion.value.previousContent === "string") {
    return {
      label: "上一版",
      content: activeVersion.value.previousContent,
    };
  }
  const olderVersion = props.versions[activeIndex.value + 1];
  if (!olderVersion) return null;
  return {
    label: olderVersion.label,
    content: olderVersion.content,
  };
});

const diffLines = computed<CompressedDiffLine[]>(() => {
  if (!activeVersion.value || !previousVersion.value) return [];
  return compressDiff(lineDiff(previousVersion.value.content, activeVersion.value.content), 2);
});

const charCount = computed(() => activeVersion.value?.content.length ?? 0);
const diffBaseLabel = computed(() => previousVersion.value?.label ?? "暂无上一版");

watch(
  () => props.activeId,
  () => {
    viewMode.value = "diff";
  }
);

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatListTime(timestamp: number) {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function kindLabel(_kind: DocumentVersion["kind"]) {
  return "版本";
}

function selectVersion(id: string) {
  if (id === props.activeId) return;
  emit("update:activeId", id);
}

function selectRelative(offset: number) {
  const index = activeIndex.value;
  if (index < 0) return;
  const next = props.versions[index + offset];
  if (!next) return;
  emit("update:activeId", next.id);
}

function handleRestore() {
  if (!activeVersion.value) return;
  emit("restore", activeVersion.value.content);
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) emit("close");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
    return;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    selectRelative(-1);
  }
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    selectRelative(1);
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div v-if="activeVersion" class="version-overlay" @click="handleBackdropClick">
    <div class="version-dialog" role="dialog" aria-modal="true" :aria-label="activeVersion.label">
      <aside v-if="versions.length > 1" class="version-sidebar">
        <p class="version-sidebar-title">历史版本</p>
        <div class="version-sidebar-list">
          <button
            v-for="(item, index) in versions"
            :key="item.id"
            class="version-sidebar-item"
            :class="{ active: item.id === activeId }"
            type="button"
            @click="selectVersion(item.id)"
          >
            <span class="version-sidebar-index">{{ index + 1 }}</span>
            <span class="version-sidebar-body">
              <span class="version-sidebar-label">{{ item.label }}</span>
              <span class="version-sidebar-meta">{{ formatListTime(item.timestamp) }}</span>
            </span>
          </button>
        </div>
      </aside>

      <div class="version-main">
        <header class="version-header">
          <div class="version-heading">
            <div v-if="versions.length > 1" class="version-nav">
              <button
                class="version-nav-btn"
                type="button"
                title="上一版本"
                :disabled="!hasPrev"
                @click="selectRelative(-1)"
              >
                ‹
              </button>
              <span class="version-nav-pos">{{ activeIndex + 1 }} / {{ versions.length }}</span>
              <button
                class="version-nav-btn"
                type="button"
                title="下一版本"
                :disabled="!hasNext"
                @click="selectRelative(1)"
              >
                ›
              </button>
            </div>
            <h3 class="version-title">{{ activeVersion.label }}</h3>
            <p class="version-meta">
              <span class="version-kind">{{ kindLabel(activeVersion.kind) }}</span>
              <span>{{ formatTime(activeVersion.timestamp) }}</span>
              <span>{{ charCount }} 字</span>
            </p>
          </div>
          <button class="version-close-btn" type="button" title="关闭" @click="emit('close')">×</button>
        </header>

        <div class="version-tabs">
          <button
            class="version-tab"
            :class="{ active: viewMode === 'diff' }"
            type="button"
            @click="viewMode = 'diff'"
          >
            与上一版对比
          </button>
          <button
            class="version-tab"
            :class="{ active: viewMode === 'preview' }"
            type="button"
            @click="viewMode = 'preview'"
          >
            预览
          </button>
        </div>

        <div class="version-body">
          <pre v-if="viewMode === 'preview'" class="version-content">{{ activeVersion.content }}</pre>
          <div v-else class="version-diff">
            <div class="diff-base">基于：{{ diffBaseLabel }}</div>
            <div v-if="diffLines.length === 0" class="diff-empty">
              {{ previousVersion ? "与上一版没有内容差异。" : "这是最早的版本，暂无上一版可对比。" }}
            </div>
            <div
              v-for="(line, idx) in diffLines"
              :key="idx"
              :class="['diff-line', `diff-type-${line.type}`]"
            >
              <span class="diff-sign">
                {{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : line.type === 'ellipsis' ? '·' : ' ' }}
              </span>
              <span>{{ line.text }}</span>
            </div>
          </div>
        </div>

        <footer class="version-footer">
          <button class="ai-btn ai-btn-ghost" type="button" @click="emit('close')">关闭</button>
          <button
            class="ai-btn ai-btn-apply"
            type="button"
            :disabled="activeVersion.content === currentDoc"
            @click="handleRestore"
          >
            恢复此版本
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, #000 42%, transparent);
}

.version-dialog {
  width: min(920px, 100%);
  max-height: min(82vh, 760px);
  display: flex;
  flex-direction: row;
  border: 1px solid var(--ink-border);
  border-radius: 12px;
  background: var(--ink-surface);
  box-shadow: 0 18px 48px color-mix(in srgb, #000 24%, transparent);
  overflow: hidden;
}

.version-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--ink-border);
  background: var(--ink-bg);
  min-height: 0;
}

.version-sidebar-title {
  margin: 0;
  padding: 12px 12px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-text-muted);
  letter-spacing: 0.04em;
}

.version-sidebar-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-sidebar-item {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.version-sidebar-item:hover {
  background: var(--ink-accent-soft);
}

.version-sidebar-item.active {
  border-color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.version-sidebar-index {
  flex-shrink: 0;
  width: 18px;
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-text-muted);
  line-height: 1.4;
}

.version-sidebar-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.version-sidebar-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-text);
  line-height: 1.35;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.version-sidebar-meta {
  font-size: 10px;
  color: var(--ink-text-muted);
}

.version-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.version-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--ink-border);
}

.version-heading {
  min-width: 0;
}

.version-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.version-nav-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: var(--ink-bg);
  color: var(--ink-text);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.version-nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.version-nav-btn:not(:disabled):hover {
  border-color: var(--ink-accent);
  color: var(--ink-accent);
}

.version-nav-pos {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-text-muted);
  min-width: 48px;
  text-align: center;
}

.version-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-text);
  line-height: 1.4;
  word-break: break-all;
}

.version-meta {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--ink-text-muted);
}

.version-kind {
  font-weight: 600;
  color: var(--ink-accent);
}

.version-close-btn {
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: var(--ink-text-muted);
  cursor: pointer;
  padding: 0 4px;
}

.version-close-btn:hover {
  color: var(--ink-text);
}

.version-tabs {
  display: flex;
  gap: 8px;
  padding: 8px 16px 0;
}

.version-tab {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: var(--ink-bg);
  color: var(--ink-text-muted);
  cursor: pointer;
}

.version-tab.active {
  border-color: var(--ink-accent);
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.version-body {
  flex: 1;
  min-height: 0;
  margin: 10px 16px 0;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
  overflow: hidden;
}

.version-content,
.version-diff {
  margin: 0;
  max-height: min(52vh, 520px);
  overflow: auto;
  padding: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ink-text);
}

.version-diff {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.diff-base {
  margin-bottom: 8px;
  color: var(--ink-text-muted);
  font-family: var(--font-sans, system-ui);
  font-size: 11px;
}

.diff-empty {
  padding: 18px 0;
  color: var(--ink-text-muted);
  font-family: var(--font-sans, system-ui);
  font-size: 12px;
  text-align: center;
}

.diff-line {
  display: flex;
  gap: 6px;
}

.diff-sign {
  width: 12px;
  flex-shrink: 0;
  opacity: 0.7;
}

.diff-type-removed {
  background: color-mix(in srgb, #e53e3e 8%, transparent);
  color: #c53030;
}

.diff-type-added {
  background: color-mix(in srgb, #38a169 8%, transparent);
  color: #2f855a;
}

.diff-type-normal {
  color: var(--ink-text-muted);
}

.diff-type-ellipsis {
  color: var(--ink-text-muted);
  font-style: italic;
  justify-content: center;
  padding: 4px 0;
}

.version-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
}

.ai-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.ai-btn-apply {
  background: var(--ink-accent);
  color: #fff;
}

.ai-btn-apply:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ai-btn-ghost {
  background: transparent;
  color: var(--ink-text-muted);
}

.ai-btn-ghost:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

@media (max-width: 640px) {
  .version-dialog {
    flex-direction: column;
    max-height: min(90vh, 860px);
  }

  .version-sidebar {
    width: 100%;
    max-height: 140px;
    border-right: none;
    border-bottom: 1px solid var(--ink-border);
  }

  .version-sidebar-list {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 8px;
  }

  .version-sidebar-item {
    min-width: 160px;
  }
}
</style>
