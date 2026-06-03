<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
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
type DemoStep = {
  target?: string;
  point?: DemoPoint;
  wait?: number;
  click?: boolean;
  caption?: string;
  action?: (runId: number) => void | Promise<void>;
};
type DemoScenario = {
  init: () => void;
  steps: DemoStep[];
};

const content = ref(DEMO_MARKDOWN);
const viewMode = ref<ViewMode>("split");
const showOutline = ref(true);
const showExport = ref(false);
const showAI = ref(true);
const isDark = ref(false);
const demoRoot = ref<HTMLElement | null>(null);
const fakeCursor = ref<DemoPoint>({ x: 64, y: 18 });
const fakeCursorVisible = ref(false);
const fakeCursorClicking = ref(false);
const isDemoHovered = ref(false);
const isDemoAnimating = ref(false);
const demoCaption = ref("");
const demoHighlight = ref("");
const aiInstruction = ref("把第二段改得更简洁，保留引用块");
const aiStreamPreview = ref(
  "1. 「左侧编辑，右侧用 Source Serif 渲染预览，长文阅读更舒适。」\n" +
    "   →「左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。」\n" +
    "2. 「好的排版让文字呼吸。」→「排版留白，文字才透气。」",
);
const aiApplied = ref(false);

let animationRunId = 0;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let resolveActiveTimer: ((keepGoing: boolean) => void) | null = null;

const outlineItems = computed(() => parseOutline(content.value));

const aiInstructionFull = "把第二段改得更简洁，保留引用块";
const aiStreamPreviewFull =
  "1. 「左侧编辑，右侧用 Source Serif 渲染预览，长文阅读更舒适。」\n" +
  "   →「左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。」\n" +
  "2. 「好的排版让文字呼吸。」→「排版留白，文字才透气。」";
const aiAppliedMarkdown = DEMO_MARKDOWN.replace(
  "左侧编辑，右侧用 **Source Serif** 渲染预览，长文阅读更舒适。",
  "左侧写 Markdown，右侧即时预览排版效果，长文阅读更轻松。",
).replace(
  "> 好的排版让文字呼吸。",
  "> 排版留白，文字才透气。",
);

function setTheme(nextIsDark: boolean) {
  isDark.value = nextIsDark;
  document.documentElement.dataset.theme = isDark.value ? "dark" : "";
}

function toggleTheme() {
  setTheme(!isDark.value);
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

function isRunActive(runId: number) {
  return animationRunId === runId && !isDemoHovered.value;
}

function stopDemoAnimation() {
  animationRunId += 1;
  isDemoAnimating.value = false;
  fakeCursorClicking.value = false;
  clearActiveTimer(false);
}

function queryInDemo(selector: string) {
  return demoRoot.value?.querySelector<HTMLElement>(selector) ?? null;
}

async function getTargetPoint(step: DemoStep) {
  await nextTick();
  if (!demoRoot.value) {
    return step.point ?? fakeCursor.value;
  }

  if (step.target) {
    const target = queryInDemo(step.target);
    if (target) {
      const rootRect = demoRoot.value.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return {
        x: targetRect.left - rootRect.left + targetRect.width / 2,
        y: targetRect.top - rootRect.top + targetRect.height / 2,
      };
    }
  }

  return step.point ?? fakeCursor.value;
}

function clickTarget(selector: string) {
  queryInDemo(selector)?.click();
}

function scrollPreview(ratio: number) {
  const pane = queryInDemo(".pane-preview");
  if (!pane) {
    return;
  }

  pane.scrollTo({
    top: Math.max(0, pane.scrollHeight - pane.clientHeight) * ratio,
    behavior: "smooth",
  });
}

async function typeText(
  target: typeof aiInstruction | typeof aiStreamPreview,
  value: string,
  runId: number,
  delay = 20,
) {
  target.value = "";
  for (const char of value) {
    if (!isRunActive(runId)) {
      return;
    }
    target.value += char;
    const shouldContinue = await waitFor(delay, runId);
    if (!shouldContinue) {
      return;
    }
  }
}

function resetDemoSurface() {
  content.value = DEMO_MARKDOWN;
  showExport.value = false;
  viewMode.value = "split";
  showAI.value = false;
  showOutline.value = false;
  demoHighlight.value = "";
  demoCaption.value = "";
  aiInstruction.value = "";
  aiStreamPreview.value = "";
  aiApplied.value = false;
  scrollPreview(0);
}

const demoScenarios: Record<DemoScenarioId, DemoScenario> = {
  outline: {
    init: () => {
      resetDemoSurface();
      viewMode.value = "split";
    },
    steps: [
      {
        target: ".outline-toggle",
        click: true,
        caption: "打开章节大纲",
        action: () => (showOutline.value = true),
      },
      {
        target: ".outline-item:nth-child(1)",
        click: true,
        caption: "跳到文档开头",
        action: () => {
          demoHighlight.value = "outline-1";
          scrollPreview(0);
        },
      },
      {
        target: ".outline-item:nth-child(2)",
        click: true,
        caption: "定位到实时分屏章节",
        action: () => {
          demoHighlight.value = "outline-2";
          scrollPreview(0.28);
        },
      },
      {
        target: ".outline-item:nth-child(3)",
        click: true,
        caption: "继续跳到 AI 辅助改写",
        action: () => {
          demoHighlight.value = "outline-3";
          scrollPreview(0.62);
        },
      },
    ],
  },
  preview: {
    init: () => {
      resetDemoSurface();
      showOutline.value = false;
      viewMode.value = "split";
    },
    steps: [
      {
        target: ".view-btn:nth-child(2)",
        click: true,
        caption: "切到纯编辑模式",
        action: () => {
          viewMode.value = "edit";
        },
      },
      {
        target: ".view-btn:nth-child(1)",
        click: true,
        caption: "回到分屏实时预览",
        action: () => {
          viewMode.value = "split";
        },
      },
      {
        target: ".view-btn:nth-child(3)",
        click: true,
        caption: "切到沉浸预览模式",
        action: () => {
          viewMode.value = "preview";
        },
      },
      {
        target: ".pane-preview",
        caption: "预览区独立滚动查看全文",
        wait: 420,
        action: () => scrollPreview(0.68),
      },
    ],
  },
  ai: {
    init: () => {
      resetDemoSurface();
      viewMode.value = "split";
    },
    steps: [
      {
        target: ".ai-toggle",
        click: true,
        caption: "打开 AI 改写面板",
        action: () => (showAI.value = true),
      },
      {
        target: ".ai-input",
        click: true,
        caption: "输入改写要求",
        action: (runId) => typeText(aiInstruction, aiInstructionFull, runId, 24),
      },
      {
        target: ".ai-btn-primary",
        click: true,
        caption: "发送给 AI",
      },
      {
        target: ".ai-stream",
        caption: "模拟返回可审阅的修改",
        wait: 320,
        action: (runId) => typeText(aiStreamPreview, aiStreamPreviewFull, runId, 10),
      },
      {
        target: ".ai-btn-apply",
        click: true,
        caption: "确认并应用修改",
        action: () => {
          content.value = aiAppliedMarkdown;
          aiApplied.value = true;
        },
      },
    ],
  },
  export: {
    init: () => {
      resetDemoSurface();
      viewMode.value = "split";
    },
    steps: [
      {
        target: ".export-toggle",
        click: true,
        caption: "打开导出菜单",
        action: () => clickTarget(".export-toggle"),
      },
      {
        target: ".export-dropdown-item:first-child",
        click: true,
        caption: "进入社交媒体导出工作台",
        action: () => clickTarget(".export-dropdown-item:first-child"),
      },
      {
        target: ".type-btn:nth-child(2)",
        click: true,
        caption: "切到小红书卡片",
        action: () => clickTarget(".type-btn:nth-child(2)"),
      },
      {
        target: ".ratio-btn:nth-child(2)",
        click: true,
        caption: "选择 3:4 长卡片比例",
        action: () => clickTarget(".ratio-btn:nth-child(2)"),
      },
      {
        target: ".type-btn:nth-child(1)",
        click: true,
        caption: "切回公众号长文预览",
        action: () => clickTarget(".type-btn:nth-child(1)"),
      },
      {
        target: ".theme-card:nth-child(2)",
        click: true,
        caption: "切换公众号排版样式",
        action: () => clickTarget(".theme-card:nth-child(2)"),
      },
    ],
  },
};

async function playSteps(steps: DemoStep[], runId: number) {
  fakeCursorVisible.value = true;
  fakeCursorClicking.value = false;
  isDemoAnimating.value = true;

  for (const step of steps) {
    if (!isRunActive(runId)) {
      break;
    }

    if (step.caption) {
      demoCaption.value = step.caption;
    }
    fakeCursor.value = await getTargetPoint(step);
    const shouldContinue = await waitFor(step.wait ?? 460, runId);
    if (!shouldContinue) {
      break;
    }

    if (step.click) {
      fakeCursorClicking.value = true;
      const clickDone = await waitFor(180, runId);
      fakeCursorClicking.value = false;
      if (!clickDone) {
        break;
      }
    }

    await step.action?.(runId);
    await nextTick();
  }

  if (isRunActive(runId)) {
    isDemoAnimating.value = false;
  }
}

async function runScenario(id: DemoScenarioId) {
  const runId = animationRunId + 1;
  animationRunId = runId;
  demoScenarios[id].init();
  await nextTick();
  await playSteps(demoScenarios[id].steps, runId);
}

async function runThemeToggle() {
  const runId = animationRunId + 1;
  animationRunId = runId;
  demoCaption.value = isDark.value ? "模拟点击切回浅色模式" : "模拟点击切到暗黑模式";
  await playSteps(
    [
      {
        target: ".theme-toggle",
        click: true,
        action: () => toggleTheme(),
      },
    ],
    runId,
  );
}

function updateCursorFromPointer(event: PointerEvent) {
  const rect = demoRoot.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  fakeCursor.value = {
    x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)),
    y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)),
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

defineExpose({ runScenario, runThemeToggle, toggleTheme, isDark });
</script>

<template>
  <div
    ref="demoRoot"
    class="sheaf-demo"
    :class="{
      'is-dark': isDark,
      'is-demo-hovered': isDemoHovered,
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
      <div
        class="demo-workspace"
        :class="[`mode-${viewMode}`, demoHighlight ? `highlight-${demoHighlight}` : '']"
      >
        <section v-show="viewMode !== 'preview'" class="pane pane-editor">
          <MarkdownEditor v-model="content" />
        </section>
        <div v-if="viewMode === 'split'" class="divider" aria-hidden="true" />
        <section v-show="viewMode !== 'edit'" class="pane pane-preview">
          <MarkdownPreview :source="content" />
        </section>
        <AIPanelDemo
          v-if="showAI"
          :instruction="aiInstruction"
          :stream-preview="aiStreamPreview"
          :change-count="2"
          :applied="aiApplied"
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
    <div v-if="demoCaption" class="demo-caption">
      {{ demoCaption }}
    </div>
    <div
      class="demo-fake-cursor"
      :class="{
        visible: fakeCursorVisible,
        clicking: fakeCursorClicking,
        'user-led': isDemoHovered,
      }"
      :style="{ left: `${fakeCursor.x}px`, top: `${fakeCursor.y}px` }"
      aria-hidden="true"
    >
      <svg
        class="demo-fake-cursor-shape"
        viewBox="0 0 28 32"
        focusable="false"
        aria-hidden="true"
      >
        <path
          class="demo-cursor-outline"
          d="M2 2.5v24.2l6.8-6.4 4.5 9.5 5.1-2.4-4.5-9.4h9.2L2 2.5Z"
        />
        <path
          class="demo-cursor-fill"
          d="M4.2 7.3v14.3l4.9-4.7 4.4 9.3 1.6-.8-4.4-9.2h6.1L4.2 7.3Z"
        />
      </svg>
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

.is-demo-hovered,
.is-demo-hovered * {
  cursor: none !important;
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

.highlight-outline-1 :deep(.outline-item:nth-child(1)),
.highlight-outline-2 :deep(.outline-item:nth-child(2)),
.highlight-outline-3 :deep(.outline-item:nth-child(3)) {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.divider {
  width: 1px;
  background: var(--ink-border-strong);
  flex-shrink: 0;
}

.demo-caption {
  position: absolute;
  left: 50%;
  bottom: 16px;
  z-index: 240;
  max-width: min(520px, calc(100% - 32px));
  padding: 8px 14px;
  border: 1px solid var(--ink-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink-surface) 90%, transparent);
  box-shadow: 0 10px 28px var(--ink-shadow);
  color: var(--ink-text);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
  pointer-events: none;
}

.demo-fake-cursor {
  position: absolute;
  z-index: 250;
  width: 28px;
  height: 32px;
  pointer-events: none;
  opacity: 0;
  transform: translate(0, 0);
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
  display: block;
  left: 0;
  top: 0;
  width: 28px;
  height: 32px;
  filter: drop-shadow(0 5px 8px rgba(42, 37, 32, 0.24));
}

.demo-cursor-outline {
  fill: #fff;
}

.demo-cursor-fill {
  fill: #111;
}

.demo-fake-cursor-pulse {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ink-accent);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.4);
}

.demo-fake-cursor.clicking {
  transform: scale(0.94);
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
