<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import AIPanelDemo from "./AIPanelDemo.vue";
import ExportStudio from "../../components/ExportStudio.vue";
import MarkdownEditor from "../../components/MarkdownEditor.vue";
import MarkdownPreview from "../../components/MarkdownPreview.vue";
import OutlinePanel from "../../components/OutlinePanel.vue";
import Toolbar from "../../components/Toolbar.vue";
import type { ViewMode } from "../../components/Toolbar.vue";
import { DEMO_MARKDOWN } from "../../shared/demoContent";
import { parseOutline } from "../../composables/useOutline";

export type DemoScenarioId = "outline" | "preview" | "ai" | "export";
type DemoPoint = { x: number; y: number };
type DemoStep = DemoPoint & {
  wait?: number;
  click?: boolean;
  action?: () => void;
};

const content = ref(DEMO_MARKDOWN);
const viewMode = ref<ViewMode>("split");
const showOutline = ref(true);
const showExport = ref(false);
const showAI = ref(true);
const isDark = ref(false);
const demoRoot = ref<HTMLElement | null>(null);
const fakeCursor = ref<DemoPoint>({ x: 60, y: 16 });
const fakeCursorVisible = ref(false);
const fakeCursorClicking = ref(false);
const isDemoHovered = ref(false);
const isDemoAnimating = ref(false);

let animationRunId = 0;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let resolveActiveTimer: ((keepGoing: boolean) => void) | null = null;

const outlineItems = computed(() => parseOutline(content.value));

const aiStreamPreview =
  "1. 「在左侧输入 Markdown，右侧实时预览渲染效果。」→「左侧写 Markdown，右侧即时预览。」\n" +
  "2. 「> 好的排版让文字呼吸。」→「> 排版留白，文字才透气。」";

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.dataset.theme = isDark.value ? "dark" : "";
}

function clearActiveTimer(keepGoing = false) {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  resolveActiveTimer?.(keepGoing);
  resolveActiveTimer = null;
}

function waitFor(ms: number, runId: number) {
  clearActiveTimer(false);
  return new Promise<boolean>((resolve) => {
    resolveActiveTimer = resolve;
    activeTimer = setTimeout(() => {
      activeTimer = null;
      resolveActiveTimer = null;
      resolve(animationRunId === runId && !isDemoHovered.value);
    }, ms);
  });
}

function stopDemoAnimation() {
  animationRunId += 1;
  isDemoAnimating.value = false;
  fakeCursorClicking.value = false;
  clearActiveTimer(false);
}

function resetScenarioState() {
  showExport.value = false;
  viewMode.value = "split";
  showAI.value = false;
  showOutline.value = false;
}

function getScenarioSteps(id: DemoScenarioId): DemoStep[] {
  const steps: Record<DemoScenarioId, DemoStep[]> = {
    outline: [
      { x: 74, y: 12 },
      { x: 74, y: 12, click: true, action: () => (showOutline.value = true) },
      { x: 89, y: 34, wait: 720 },
      { x: 82, y: 55, wait: 520 },
    ],
    preview: [
      { x: 93, y: 12 },
      { x: 93, y: 12, click: true, action: () => (viewMode.value = "preview") },
      { x: 50, y: 36, wait: 620 },
      { x: 56, y: 64, wait: 560 },
    ],
    ai: [
      { x: 63, y: 12 },
      { x: 63, y: 12, click: true, action: () => (showAI.value = true) },
      { x: 82, y: 33, wait: 620 },
      { x: 83, y: 52, wait: 560 },
      { x: 76, y: 72, click: true, wait: 420 },
    ],
    export: [
      { x: 69, y: 12 },
      { x: 69, y: 12, click: true, action: () => (showExport.value = true) },
      { x: 49, y: 33, wait: 620 },
      { x: 58, y: 59, wait: 560 },
    ],
  };

  return steps[id];
}

async function runScenario(id: DemoScenarioId) {
  const runId = animationRunId + 1;
  animationRunId = runId;
  resetScenarioState();
  fakeCursorVisible.value = true;
  fakeCursorClicking.value = false;
  isDemoAnimating.value = true;

  for (const step of getScenarioSteps(id)) {
    if (animationRunId !== runId || isDemoHovered.value) {
      break;
    }

    fakeCursor.value = { x: step.x, y: step.y };
    const shouldContinue = await waitFor(step.wait ?? 460, runId);
    if (!shouldContinue) {
      break;
    }

    step.action?.();
    if (step.click) {
      fakeCursorClicking.value = true;
      const clickDone = await waitFor(180, runId);
      fakeCursorClicking.value = false;
      if (!clickDone) {
        break;
      }
    }
  }

  if (animationRunId === runId && !isDemoHovered.value) {
    isDemoAnimating.value = false;
  }
}

function updateCursorFromPointer(event: PointerEvent) {
  const rect = demoRoot.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  fakeCursor.value = {
    x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
  };
}

function onDemoPointerEnter(event: PointerEvent) {
  isDemoHovered.value = true;
  fakeCursorVisible.value = true;
  stopDemoAnimation();
  updateCursorFromPointer(event);
}

function onDemoPointerMove(event: PointerEvent) {
  if (!isDemoHovered.value) {
    return;
  }
  updateCursorFromPointer(event);
}

function onDemoPointerLeave() {
  isDemoHovered.value = false;
  fakeCursorClicking.value = false;
}

onUnmounted(() => {
  stopDemoAnimation();
});

defineExpose({ runScenario, toggleTheme, isDark });
</script>

<template>
  <div
    ref="demoRoot"
    class="sheaf-demo"
    :class="{
      'is-dark': isDark,
      'is-demo-animating': isDemoAnimating,
    }"
    :data-theme="isDark ? 'dark' : undefined"
    @pointerenter="onDemoPointerEnter"
    @pointermove="onDemoPointerMove"
    @pointerleave="onDemoPointerLeave"
  >
    <div class="demo-chrome">
      <span class="chrome-dot" />
      <span class="chrome-dot" />
      <span class="chrome-dot" />
      <span class="chrome-title">Sheaf — 写作示例.md</span>
    </div>
    <div class="demo-app">
      <Toolbar
        file-name="写作示例.md"
        :is-dirty="false"
        :view-mode="viewMode"
        :is-dark="isDark"
        :exporting="false"
        :show-outline="showOutline"
        :show-export="showExport"
        :show-a-i="showAI"
        @toggle-theme="toggleTheme"
        @toggle-outline="showOutline = !showOutline"
        @open-export="showExport = true"
        @toggle-a-i="showAI = !showAI"
        @update:view-mode="viewMode = $event"
      />
      <div class="demo-workspace" :class="`mode-${viewMode}`">
        <section v-show="viewMode !== 'preview'" class="pane pane-editor">
          <MarkdownEditor v-model="content" />
        </section>
        <div v-if="viewMode === 'split'" class="divider" aria-hidden="true" />
        <section v-show="viewMode !== 'edit'" class="pane pane-preview">
          <MarkdownPreview :source="content" />
        </section>
        <AIPanelDemo
          v-if="showAI"
          instruction="把第二段改得更简洁，保留引用块"
          :stream-preview="aiStreamPreview"
          :change-count="2"
        />
        <OutlinePanel
          v-if="showOutline"
          :items="outlineItems"
          @navigate="() => {}"
        />
      </div>
      <ExportStudio
        v-if="showExport"
        v-model="content"
        file-name="写作示例.md"
        :is-dark="isDark"
        embedded
        @close="showExport = false"
      />
    </div>
    <div
      class="demo-fake-cursor"
      :class="{
        visible: fakeCursorVisible,
        clicking: fakeCursorClicking,
        'user-led': isDemoHovered,
      }"
      :style="{ left: `${fakeCursor.x}%`, top: `${fakeCursor.y}%` }"
      aria-hidden="true"
    >
      <span class="demo-fake-cursor-shape" />
      <span class="demo-fake-cursor-pulse" />
    </div>
  </div>
</template>

<style scoped>
.sheaf-demo {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--ink-border-strong);
  box-shadow:
    0 24px 48px var(--ink-shadow),
    0 0 0 1px rgba(42, 37, 32, 0.04);
  background: var(--ink-bg);
}

.demo-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  background: var(--ink-surface);
  border-bottom: 1px solid var(--ink-border);
}

.chrome-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ink-border-strong);
}

.chrome-dot:nth-child(1) {
  background: #e8a598;
}
.chrome-dot:nth-child(2) {
  background: #e8d49a;
}
.chrome-dot:nth-child(3) {
  background: #9bc49a;
}

.chrome-title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--ink-text-muted);
  margin-right: 54px;
}

.demo-app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 600px;
}

.demo-app :deep(.toolbar) {
  -webkit-app-region: unset;
}

.is-demo-animating .demo-app {
  pointer-events: none;
}

.demo-workspace {
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

.mode-preview .pane-preview {
  flex: 1;
  overflow: auto;
}

.pane-preview {
  overflow: auto;
}

.divider {
  width: 1px;
  background: var(--ink-border-strong);
  flex-shrink: 0;
}

.demo-fake-cursor {
  position: absolute;
  z-index: 250;
  width: 18px;
  height: 18px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-2px, -2px);
  transition:
    left 0.42s cubic-bezier(0.2, 0.8, 0.2, 1),
    top 0.42s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.16s ease;
}

.demo-fake-cursor.visible {
  opacity: 1;
}

.demo-fake-cursor.user-led {
  transition:
    opacity 0.16s ease,
    transform 0.12s ease;
}

.demo-fake-cursor-shape {
  position: absolute;
  inset: 0;
  display: block;
  filter: drop-shadow(0 5px 10px rgba(42, 37, 32, 0.22));
}

.demo-fake-cursor-shape::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  border-top: 16px solid var(--ink-text);
  border-right: 10px solid transparent;
}

.demo-fake-cursor-shape::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 3px;
  width: 0;
  height: 0;
  border-top: 9px solid var(--ink-bg);
  border-right: 6px solid transparent;
  opacity: 0.9;
}

.demo-fake-cursor-pulse {
  position: absolute;
  left: 10px;
  top: 10px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ink-accent);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.4);
}

.demo-fake-cursor.clicking {
  transform: translate(-2px, -2px) scale(0.94);
}

.demo-fake-cursor.clicking .demo-fake-cursor-pulse {
  animation: demo-click-pulse 0.18s ease-out;
}

@keyframes demo-click-pulse {
  from {
    opacity: 0.7;
    transform: translate(-50%, -50%) scale(0.4);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(3.2);
  }
}
</style>
