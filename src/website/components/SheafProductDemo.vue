<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import AIPanel from "../../components/AIPanel.vue";
import ExportStudio from "../../components/ExportStudio.vue";
import MarkdownEditor from "../../components/MarkdownEditor.vue";
import MarkdownPreview from "../../components/MarkdownPreview.vue";
import OutlinePanel from "../../components/OutlinePanel.vue";
import Toolbar from "../../components/Toolbar.vue";
import type { ViewMode } from "../../components/Toolbar.vue";
import { applyChangesToDoc, type EditChange } from "../../composables/useAI";
import { useLocale } from "../../composables/useLocale";
import { getDemoMarkdown } from "../../shared/demoContent";
import { getDemoAiInstruction } from "../../shared/demoAiData";
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

const DEMO_TIMING = {
  stepPause: 720,
  clickPulse: 280,
  beforeScroll: 680,
  beforeStream: 520,
  typeChar: 38,
  typeStreamChar: 16,
} as const;

const { t, locale } = useLocale();

const content = ref(getDemoMarkdown(locale.value));
const viewMode = ref<ViewMode>("split");
const showOutline = ref(true);
const showExport = ref(false);
const showAI = ref(true);
const isDark = defineModel<boolean>("dark", { default: false });
const demoRoot = ref<HTMLElement | null>(null);
const aiPanelRef = ref<InstanceType<typeof AIPanel> | null>(null);
const fakeCursor = ref<DemoPoint>({ x: 64, y: 18 });
const fakeCursorVisible = ref(false);
const fakeCursorClicking = ref(false);
const isDemoAnimating = ref(false);
const isPointerInside = ref(false);
const demoCaption = ref("");
const demoHighlight = ref("");

let animationRunId = 0;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let resolveActiveTimer: ((keepGoing: boolean) => void) | null = null;

const outlineItems = computed(() => parseOutline(content.value));

function resetDemoSurface() {
  content.value = getDemoMarkdown(locale.value);
  showExport.value = false;
  viewMode.value = "split";
  showAI.value = false;
  showOutline.value = false;
  demoHighlight.value = "";
  demoCaption.value = "";
  aiPanelRef.value?.resetDemo();
  scrollPreview(0);
}

watch(locale, () => {
  stopDemoAnimation();
  resetDemoSurface();
});

const demoScenarios = computed<Record<DemoScenarioId, DemoScenario>>(() => ({
  outline: {
    init: () => {
      resetDemoSurface();
      viewMode.value = "split";
    },
    steps: [
      {
        target: ".outline-toggle",
        click: true,
        caption: t("landing.demo.steps.outline.open"),
        action: () => (showOutline.value = true),
      },
      {
        target: ".outline-item:nth-child(1)",
        click: true,
        caption: t("landing.demo.steps.outline.jumpStart"),
        action: () => {
          demoHighlight.value = "outline-1";
          scrollPreview(0);
        },
      },
      {
        target: ".outline-item:nth-child(2)",
        click: true,
        caption: t("landing.demo.steps.outline.jumpSplit"),
        action: () => {
          demoHighlight.value = "outline-2";
          scrollPreview(0.28);
        },
      },
      {
        target: ".outline-item:nth-child(3)",
        click: true,
        caption: t("landing.demo.steps.outline.jumpAi"),
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
        caption: t("landing.demo.steps.preview.editOnly"),
        action: () => {
          viewMode.value = "edit";
        },
      },
      {
        target: ".view-btn:nth-child(3)",
        click: true,
        caption: t("landing.demo.steps.preview.previewOnly"),
        action: () => {
          viewMode.value = "preview";
        },
      },
      {
        target: ".pane-preview",
        caption: t("landing.demo.steps.preview.scroll"),
        wait: DEMO_TIMING.beforeScroll,
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
        caption: t("landing.demo.steps.ai.openPanel"),
        action: () => (showAI.value = true),
      },
      {
        target: ".ai-input",
        click: true,
        caption: t("landing.demo.steps.ai.typeInstruction"),
        action: (runId) =>
          typeInstruction(getDemoAiInstruction(locale.value), runId, DEMO_TIMING.typeChar),
      },
      {
        target: ".ai-btn-primary",
        click: true,
        caption: t("landing.demo.steps.ai.send"),
        action: () => clickTarget(".ai-btn-primary"),
      },
      {
        target: ".ai-btn-apply",
        click: true,
        caption: t("landing.demo.steps.ai.apply"),
        action: async (runId) => {
          if (!(await waitForSelector(".ai-btn-apply", runId))) {
            return;
          }
          clickTarget(".ai-btn-apply");
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
        caption: t("landing.demo.steps.export.openMenu"),
        action: () => clickTarget(".export-toggle"),
      },
      {
        target: ".export-dropdown-item:first-child",
        click: true,
        caption: t("landing.demo.steps.export.openStudio"),
        action: () => {
          clickTarget(".export-dropdown-item:first-child");
          showExport.value = true;
        },
      },
      {
        target: ".theme-card:nth-child(2)",
        click: true,
        caption: t("landing.demo.steps.export.wechatTheme1"),
        action: async (runId) => {
          if (!(await waitForSelector(".theme-card:nth-child(2)", runId))) {
            return;
          }
          clickTarget(".theme-card:nth-child(2)");
        },
      },
      {
        target: ".theme-card:nth-child(3)",
        click: true,
        caption: t("landing.demo.steps.export.wechatTheme2"),
        action: () => clickTarget(".theme-card:nth-child(3)"),
      },
      {
        target: ".type-btn:nth-child(2)",
        click: true,
        caption: t("landing.demo.steps.export.cardType"),
        action: () => clickTarget(".type-btn:nth-child(2)"),
      },
      {
        target: ".theme-card:nth-child(2)",
        click: true,
        caption: t("landing.demo.steps.export.cardTheme1"),
        action: async (runId) => {
          if (!(await waitForSelector(".type-btn:nth-child(2).active", runId))) {
            return;
          }
          clickTarget(".theme-card:nth-child(2)");
        },
      },
      {
        target: ".theme-card:nth-child(3)",
        click: true,
        caption: t("landing.demo.steps.export.cardTheme2"),
        action: () => clickTarget(".theme-card:nth-child(3)"),
      },
      {
        target: ".type-btn:nth-child(3)",
        click: true,
        caption: t("landing.demo.steps.export.longImageType"),
        action: () => clickTarget(".type-btn:nth-child(3)"),
      },
      {
        target: ".theme-card:nth-child(2)",
        click: true,
        caption: t("landing.demo.steps.export.longImageTheme"),
        action: async (runId) => {
          if (!(await waitForSelector(".type-btn:nth-child(3).active", runId))) {
            return;
          }
          clickTarget(".theme-card:nth-child(2)");
        },
      },
    ],
  },
}));

function setTheme(nextIsDark: boolean) {
  isDark.value = nextIsDark;
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
      resolve(animationRunId === runId);
    }, ms);
  });
}

function isRunActive(runId: number) {
  return animationRunId === runId;
}

function stopDemoAnimation() {
  animationRunId += 1;
  isDemoAnimating.value = false;
  fakeCursorClicking.value = false;
  fakeCursorVisible.value = isPointerInside.value;
  clearActiveTimer(false);
}

function queryInDemo(selector: string) {
  return demoRoot.value?.querySelector<HTMLElement>(selector) ?? null;
}

function getDemoScale(rootRect: DOMRect) {
  const width = demoRoot.value?.offsetWidth ?? rootRect.width;
  return width > 0 ? rootRect.width / width : 1;
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
      const scale = getDemoScale(rootRect);
      return {
        x: (targetRect.left - rootRect.left + targetRect.width / 2) / scale,
        y: (targetRect.top - rootRect.top + targetRect.height / 2) / scale,
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

async function typeInstruction(value: string, runId: number, delay = 20) {
  aiPanelRef.value?.setInstruction("");
  let current = "";
  for (const char of value) {
    if (!isRunActive(runId)) {
      return;
    }
    current += char;
    aiPanelRef.value?.setInstruction(current);
    const shouldContinue = await waitFor(delay, runId);
    if (!shouldContinue) {
      return;
    }
  }
}

async function waitForSelector(selector: string, runId: number, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isRunActive(runId)) {
      return false;
    }
    if (queryInDemo(selector)) {
      return true;
    }
    const shouldContinue = await waitFor(80, runId);
    if (!shouldContinue) {
      return false;
    }
  }
  return false;
}

function applyDemoAiChanges(changes: EditChange[]) {
  content.value = applyChangesToDoc(content.value, changes);
}

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
    const shouldContinue = await waitFor(step.wait ?? DEMO_TIMING.stepPause, runId);
    if (!shouldContinue) {
      break;
    }

    if (step.click) {
      fakeCursorClicking.value = true;
      const clickDone = await waitFor(DEMO_TIMING.clickPulse, runId);
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
    fakeCursorVisible.value = isPointerInside.value;
  }
}

async function runScenario(id: DemoScenarioId) {
  const runId = animationRunId + 1;
  animationRunId = runId;
  const scenario = demoScenarios.value[id];
  scenario.init();
  await nextTick();
  await playSteps(scenario.steps, runId);
}

async function runThemeToggle() {
  const runId = animationRunId + 1;
  animationRunId = runId;
  const targetDark = !isDark.value;
  showExport.value = false;
  await nextTick();
  demoCaption.value = targetDark
    ? t("landing.demo.steps.themeDark")
    : t("landing.demo.steps.themeLight");
  await playSteps(
    [
      {
        target: ".theme-toggle",
        click: true,
        action: () => setTheme(targetDark),
      },
    ],
    runId,
  );
}

function pointerToLocal(event: PointerEvent): DemoPoint | null {
  const rect = demoRoot.value?.getBoundingClientRect();
  if (!rect) return null;
  const scale = getDemoScale(rect);
  const width = rect.width / scale;
  const height = rect.height / scale;
  return {
    x: Math.min(width, Math.max(0, (event.clientX - rect.left) / scale)),
    y: Math.min(height, Math.max(0, (event.clientY - rect.top) / scale)),
  };
}

function followPointer(event: PointerEvent) {
  if (isDemoAnimating.value) return;
  const point = pointerToLocal(event);
  if (!point) return;
  fakeCursor.value = point;
  fakeCursorVisible.value = true;
}

function onDemoPointerEnter(event: PointerEvent) {
  isPointerInside.value = true;
  followPointer(event);
}

function onDemoPointerMove(event: PointerEvent) {
  if (!isPointerInside.value) return;
  followPointer(event);
}

function onDemoPointerLeave() {
  isPointerInside.value = false;
  if (!isDemoAnimating.value) {
    fakeCursorVisible.value = false;
  }
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
      <span class="chrome-title">{{ t("landing.demo.windowTitle") }}</span>
    </div>
    <div class="demo-app">
      <Toolbar
        :file-name="t('landing.demo.fileName')"
        :file-path="null"
        :is-dirty="false"
        :view-mode="viewMode"
        :is-dark="isDark"
        :exporting="false"
        :show-outline="showOutline"
        :show-export="showExport"
        :show-a-i="showAI"
        :show-versions="false"
        :has-versions="false"
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
        <AIPanel
          v-if="showAI"
          ref="aiPanelRef"
          demo-mode
          :doc="content"
          document-key="__website_demo__"
          @apply="applyDemoAiChanges"
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
        :file-name="t('landing.demo.fileName')"
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
        'user-led': fakeCursorVisible && !isDemoAnimating,
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

.sheaf-demo,
.sheaf-demo * {
  cursor: none !important;
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
  gap: 12px;
}

.demo-app :deep(.toolbar-left) {
  flex: 0 0 auto;
}

.demo-app :deep(.toolbar-center) {
  flex: 1 1 auto;
}

.demo-app :deep(.toolbar-right) {
  flex: 0 0 auto;
}

.demo-app :deep(.btn),
.demo-app :deep(.view-btn) {
  flex-shrink: 0;
  white-space: nowrap;
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
    left 0.68s cubic-bezier(0.22, 0.03, 0.26, 1),
    top 0.68s cubic-bezier(0.22, 0.03, 0.26, 1),
    opacity 0.2s ease;
}

.demo-fake-cursor.visible {
  opacity: 1;
}

.demo-fake-cursor.user-led {
  transition: opacity 0.16s ease;
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
  animation: demo-click-pulse 0.28s ease-out;
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
