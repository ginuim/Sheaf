<script setup lang="ts">
import { computed, ref } from "vue";
import AIPanelDemo from "./AIPanelDemo.vue";
import MarkdownEditor from "../../components/MarkdownEditor.vue";
import MarkdownPreview from "../../components/MarkdownPreview.vue";
import OutlinePanel from "../../components/OutlinePanel.vue";
import Toolbar from "../../components/Toolbar.vue";
import type { ViewMode } from "../../components/Toolbar.vue";
import { DEMO_MARKDOWN } from "../../shared/demoContent";
import { parseOutline } from "../../composables/useOutline";

const content = ref(DEMO_MARKDOWN);
const viewMode = ref<ViewMode>("split");
const showOutline = ref(true);
const showAI = ref(true);
const isDark = ref(false);

const outlineItems = computed(() => parseOutline(content.value));

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.dataset.theme = isDark.value ? "dark" : "";
}
</script>

<template>
  <div
    class="sheaf-demo"
    :class="{ 'is-dark': isDark }"
    :data-theme="isDark ? 'dark' : undefined"
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
        :show-a-i="showAI"
        @toggle-theme="toggleTheme"
        @toggle-outline="showOutline = !showOutline"
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
          stream-preview="将「左侧编辑…」合并为一句，删除重复说明。"
          :change-count="2"
        />
        <OutlinePanel
          v-if="showOutline"
          :items="outlineItems"
          @navigate="() => {}"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheaf-demo {
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
  display: flex;
  flex-direction: column;
  height: 420px;
}

.demo-app :deep(.toolbar) {
  -webkit-app-region: unset;
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
</style>
