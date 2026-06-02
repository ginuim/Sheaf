<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  buildWechatHtml,
  buildWechatHtmlForCopy,
  copyPlainText,
  copyWechatHtml,
} from "../composables/useWechatExport";
import { renderMermaidIn } from "../composables/useMermaid";
import { WECHAT_THEMES, type WechatThemeId } from "../lib/wechatThemes";

const props = defineProps<{
  source: string;
  docFilePath?: string | null;
}>();

const selectedTheme = ref<WechatThemeId>("classic");
const copying = ref(false);
const toast = ref<{ type: "success" | "error"; text: string } | null>(null);
const previewRef = ref<HTMLElement | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const previewHtml = computed(() =>
  buildWechatHtml(
    props.source,
    selectedTheme.value,
    props.docFilePath ?? null,
  ),
);

function showToast(type: "success" | "error", text: string) {
  toast.value = { type, text };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 2800);
}

async function renderPreviewMermaid() {
  await nextTick();
  if (previewRef.value) await renderMermaidIn(previewRef.value);
}

onMounted(() => {
  void renderPreviewMermaid();
});

watch(previewHtml, () => {
  void renderPreviewMermaid();
});

async function handleCopyHtml() {
  if (copying.value) return;
  copying.value = true;
  try {
    const html = await buildWechatHtmlForCopy(
      props.source,
      selectedTheme.value,
      props.docFilePath ?? null,
      document.documentElement.dataset.theme === "dark",
    );
    const result = await copyWechatHtml(html);
    if (result.ok) {
      showToast("success", "已复制 HTML，可粘贴到公众号编辑器");
    } else {
      showToast("error", result.message);
    }
  } finally {
    copying.value = false;
  }
}

async function handleCopyPlain() {
  if (copying.value) return;
  copying.value = true;
  try {
    const result = await copyPlainText(props.source);
    if (result.ok) {
      showToast("success", "已复制 Markdown 纯文本");
    } else {
      showToast("error", result.message);
    }
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <aside class="export-panel">
    <header class="export-header">导出</header>

    <div class="export-body">
      <section class="export-section">
        <h3 class="section-label">公众号排版</h3>
        <p class="section-hint">样式内联，可直接粘贴到公众号后台</p>

        <div class="theme-list" role="radiogroup" aria-label="公众号样式">
          <button
            v-for="theme in WECHAT_THEMES"
            :key="theme.id"
            class="theme-card"
            :class="{ active: selectedTheme === theme.id }"
            role="radio"
            :aria-checked="selectedTheme === theme.id"
            @click="selectedTheme = theme.id"
          >
            <span class="theme-name">{{ theme.label }}</span>
            <span class="theme-desc">{{ theme.description }}</span>
          </button>
        </div>
      </section>

      <section class="export-section export-preview-section">
        <h3 class="section-label">预览</h3>
        <div class="preview-frame">
          <div ref="previewRef" class="wechat-preview" v-html="previewHtml" />
        </div>
      </section>

      <div class="export-actions">
        <button
          class="btn btn-primary"
          :disabled="copying"
          @click="handleCopyHtml"
        >
          {{ copying ? "复制中…" : "复制 HTML" }}
        </button>
        <button
          class="btn btn-ghost"
          :disabled="copying"
          @click="handleCopyPlain"
        >
          复制纯文本
        </button>
      </div>

      <p v-if="toast" class="export-toast" :class="toast.type">
        {{ toast.text }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.export-panel {
  display: flex;
  flex-direction: column;
  width: 280px;
  flex-shrink: 0;
  background: var(--ink-surface);
  border-left: 1px solid var(--ink-border);
  overflow: hidden;
}

.export-header {
  padding: 12px 16px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-text-muted);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.export-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.export-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-text);
  margin: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--ink-text-muted);
  margin: 0;
  line-height: 1.45;
}

.theme-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  text-align: left;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
  transition: border-color 0.15s, background 0.15s;
}

.theme-card:hover {
  border-color: var(--ink-border-strong);
}

.theme-card.active {
  border-color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.theme-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-text);
}

.theme-desc {
  font-size: 11px;
  color: var(--ink-text-muted);
  line-height: 1.4;
}

.export-preview-section {
  flex: 1;
  min-height: 0;
}

.preview-frame {
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: #ffffff;
  overflow: auto;
  max-height: 280px;
  min-height: 160px;
}

.wechat-preview {
  padding: 16px;
  color: #2a2520;
}

.wechat-preview :deep(img) {
  max-width: 100%;
}

.wechat-preview :deep(.mermaid),
.wechat-preview :deep(.katex-display) {
  overflow-x: auto;
  text-align: center;
}

.wechat-preview :deep(.mermaid) {
  margin: 18px 0;
  background: transparent;
}

.wechat-preview :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
}

.export-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.btn {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  transition: background 0.15s, opacity 0.15s;
}

.btn-primary {
  background: var(--ink-accent);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.88;
}

.btn-ghost {
  color: var(--ink-text-muted);
  font-weight: 400;
}

.btn-ghost:hover:not(:disabled) {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-toast {
  font-size: 12px;
  line-height: 1.45;
  padding: 8px 10px;
  border-radius: 6px;
  margin: 0;
}

.export-toast.success {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.export-toast.error {
  color: #c53030;
  background: color-mix(in srgb, #e53e3e 10%, transparent);
}
</style>
