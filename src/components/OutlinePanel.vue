<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { OutlineItem } from "../composables/useOutline";

const DEFAULT_PANEL_WIDTH = 220;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 420;
const PANEL_WIDTH_STORAGE_KEY = "sheaf:outline-panel-width";

defineProps<{
  items: OutlineItem[];
}>();

const emit = defineEmits<{
  navigate: [item: OutlineItem];
}>();

const panelWidth = ref(DEFAULT_PANEL_WIDTH);
const isResizing = ref(false);
const panelStyle = computed(() => ({
  width: `${panelWidth.value}px`,
}));
let resizeStartX = 0;
let resizeStartWidth = DEFAULT_PANEL_WIDTH;
let previousBodyCursor = "";
let previousBodyUserSelect = "";

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

function persistPanelWidth() {
  localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth.value));
}

function loadPanelWidth() {
  const savedWidth = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
  if (Number.isFinite(savedWidth)) {
    panelWidth.value = clampPanelWidth(savedWidth);
  }
}

function setPanelWidth(width: number, shouldPersist = true) {
  panelWidth.value = clampPanelWidth(width);
  if (shouldPersist) {
    persistPanelWidth();
  }
}

function onResizeMove(event: PointerEvent) {
  const deltaX = event.clientX - resizeStartX;
  setPanelWidth(resizeStartWidth - deltaX, false);
}

function stopResize() {
  if (!isResizing.value) return;
  isResizing.value = false;
  document.removeEventListener("pointermove", onResizeMove);
  document.removeEventListener("pointerup", stopResize);
  document.removeEventListener("pointercancel", stopResize);
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  persistPanelWidth();
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  isResizing.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("pointermove", onResizeMove);
  document.addEventListener("pointerup", stopResize);
  document.addEventListener("pointercancel", stopResize);
}

function onResizeKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 40 : 16;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setPanelWidth(panelWidth.value + step);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    setPanelWidth(panelWidth.value - step);
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    setPanelWidth(MIN_PANEL_WIDTH);
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    setPanelWidth(MAX_PANEL_WIDTH);
  }
}

onMounted(() => {
  loadPanelWidth();
});

onUnmounted(() => {
  stopResize();
});
</script>

<template>
  <aside class="outline-panel" :class="{ 'is-resizing': isResizing }" :style="panelStyle">
    <div
      class="outline-resize-handle"
      role="separator"
      aria-label="调整章节面板宽度"
      aria-orientation="vertical"
      :aria-valuemin="MIN_PANEL_WIDTH"
      :aria-valuemax="MAX_PANEL_WIDTH"
      :aria-valuenow="panelWidth"
      tabindex="0"
      title="拖拽调整章节面板宽度"
      @pointerdown="startResize"
      @keydown="onResizeKeydown"
    />
    <header class="outline-header">章节大纲</header>
    <nav v-if="items.length" class="outline-nav" aria-label="章节大纲">
      <button
        v-for="item in items"
        :key="`${item.line}-${item.id}`"
        class="outline-item"
        :class="`level-${item.level}`"
        :title="item.text"
        @click="emit('navigate', item)"
      >
        {{ item.text }}
      </button>
    </nav>
    <p v-else class="outline-empty">文档中暂无标题</p>
  </aside>
</template>

<style scoped>
.outline-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 220px;
  min-width: 180px;
  max-width: 420px;
  flex-shrink: 0;
  background: var(--ink-surface);
  border-left: 1px solid var(--ink-border);
  overflow: hidden;
}

.outline-resize-handle {
  position: absolute;
  inset: 0 auto 0 -5px;
  z-index: 5;
  width: 10px;
  cursor: col-resize;
  outline: none;
  touch-action: none;
}

.outline-resize-handle::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 4px;
  width: 2px;
  height: 42px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink-text-muted) 24%, transparent);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.15s ease, background 0.15s ease, height 0.15s ease;
}

.outline-resize-handle:hover::before,
.outline-resize-handle:focus-visible::before,
.outline-panel.is-resizing .outline-resize-handle::before {
  height: 64px;
  opacity: 1;
  background: var(--ink-accent);
}

.outline-panel.is-resizing {
  border-left-color: color-mix(in srgb, var(--ink-accent) 46%, var(--ink-border));
}

.outline-header {
  padding: 12px 16px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-text-muted);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.outline-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 16px;
}

.outline-item {
  display: block;
  width: 100%;
  padding: 6px 16px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ink-text-muted);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s, background 0.15s;
}

.outline-item:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.outline-item.level-1 {
  font-weight: 600;
  color: var(--ink-text);
}

.outline-item.level-2 {
  padding-left: 24px;
}

.outline-item.level-3 {
  padding-left: 32px;
  font-size: 12px;
}

.outline-item.level-4 {
  padding-left: 40px;
  font-size: 12px;
}

.outline-item.level-5,
.outline-item.level-6 {
  padding-left: 48px;
  font-size: 12px;
  opacity: 0.85;
}

.outline-empty {
  padding: 16px;
  font-size: 13px;
  color: var(--ink-text-muted);
}
</style>
