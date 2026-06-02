<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { WECHAT_THEMES } from "../lib/wechatThemes";
import {
  buildWechatHtml,
  buildWechatHtmlForCopy,
  copyWechatHtml,
  copyPlainText,
} from "../composables/useWechatExport";
import { renderMarkdown } from "../composables/useMarkdown";
import { renderMermaidIn } from "../composables/useMermaid";
import MarkdownEditor from "./MarkdownEditor.vue";
import { toPng } from "html-to-image";
import { save, message } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

const props = defineProps<{
  docFilePath?: string | null;
  fileName: string;
  isDark: boolean;
}>();

const modelValue = defineModel<string>({ required: true });

const emit = defineEmits<{
  close: [];
}>();

// 导出配置状态
const config = ref({
  type: "wechat" as "wechat" | "xiaohongshu" | "long-image",
  wechatTheme: "classic" as "classic" | "editorial" | "minimal",
  cardRatio: "3:4" as "1:1" | "3:4",
  cardTheme: "classic" as "classic" | "modern" | "dark" | "glass",
  author: "Sheaf Writer",
  showWatermark: true,
  fontSize: 16,
});

const exporting = ref(false);
const exportingImage = ref(false);
const exportCaptureRef = ref<HTMLElement | null>(null);
const wechatRendererRef = ref<HTMLElement | null>(null);
const cardContentRef = ref<HTMLElement | null>(null);

// 渲染 Markdown (微信和大图片预览使用)
const renderedHtml = computed(() => {
  return renderMarkdown(modelValue.value, props.docFilePath ?? null);
});

// 微信预览和复制导出必须走同一条样式管线，否则预览会退回浏览器默认样式。
const wechatPreviewHtml = computed(() => {
  return buildWechatHtml(modelValue.value, config.value.wechatTheme, props.docFilePath ?? null);
});

// 格式化当前日期为 2026/05/29 样式
const formattedDate = computed(() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
});

// 作者头像首字母
const authorInitial = computed(() => {
  return config.value.author ? config.value.author.charAt(0).toUpperCase() : "S";
});

const shouldRenderMermaidAsDark = computed(() => {
  return props.isDark || config.value.cardTheme === "dark";
});

async function renderVisibleMermaid() {
  await nextTick();
  if (wechatRendererRef.value) {
    await renderMermaidIn(wechatRendererRef.value, props.isDark);
  }
  if (cardContentRef.value) {
    await renderMermaidIn(cardContentRef.value, shouldRenderMermaidAsDark.value);
  }
}

onMounted(() => {
  void renderVisibleMermaid();
});

watch(
  [
    renderedHtml,
    wechatPreviewHtml,
    () => config.value.type,
    () => config.value.cardTheme,
    () => props.isDark,
  ],
  () => {
    void renderVisibleMermaid();
  },
);

// 将 dataUrl 转换为 Uint8Array
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// 导出微信 HTML
async function handleCopyWechatHtml() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const html = await buildWechatHtmlForCopy(
      modelValue.value,
      config.value.wechatTheme,
      props.docFilePath ?? null,
      props.isDark,
    );
    const result = await copyWechatHtml(html);
    if (result.ok) {
      await message("已复制微信公众号格式 HTML！请在微信公众号编辑器直接粘贴。", { title: "Sheaf 导出", kind: "info" });
    } else {
      await message(result.message, { title: "Sheaf 导出", kind: "error" });
    }
  } finally {
    exporting.value = false;
  }
}

// 复制纯文本
async function handleCopyPlain() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const result = await copyPlainText(modelValue.value);
    if (result.ok) {
      await message("已复制 Markdown 纯文本至剪贴板。", { title: "Sheaf 导出", kind: "info" });
    } else {
      await message(result.message, { title: "Sheaf 导出", kind: "error" });
    }
  } finally {
    exporting.value = false;
  }
}

// 导出为图片（支持长图与小红书卡片）
async function handleDownloadImage() {
  if (exportingImage.value) return;
  const el = exportCaptureRef.value;
  if (!el) {
    await message("未找到预览节点，请重试。", { title: "Sheaf 导出", kind: "error" });
    return;
  }

  exportingImage.value = true;
  try {
    // 微信模式下不应该导出图片
    if (config.value.type === "wechat") return;

    // 隐藏可能影响排版的原生滚动条，确保截图完整
    const originalScrollTop = el.scrollTop;
    el.scrollTop = 0;

    // 稍微等待一帧
    await renderVisibleMermaid();
    await nextTick();
    await document.fonts.ready;

    // 渲染 DOM 节点为 PNG 二进制流
    const dataUrl = await toPng(el, {
      cacheBust: true,
      pixelRatio: 2, // 2倍高保真超清
      backgroundColor: "transparent",
      skipFonts: true,
      style: {
        transform: "scale(1)",
        transformOrigin: "top left",
        width: el.offsetWidth + "px",
        height: el.scrollHeight + "px",
      },
    });

    // 还原滚动位置
    el.scrollTop = originalScrollTop;

    // 弹出本地保存文件框
    const selectedPath = await save({
      title: "保存图片至本地",
      defaultPath: `${props.fileName || "untitled"}_${config.value.type}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });

    if (!selectedPath) {
      return; // 用户取消
    }

    const bytes = dataUrlToBytes(dataUrl);
    await writeFile(selectedPath, bytes);
    await message("图片保存成功！", { title: "Sheaf 导出", kind: "info" });
  } catch (error: any) {
    console.error("Export image error:", error);
    await message(error?.message || "图片导出失败，请重试。", { title: "Sheaf 导出", kind: "error" });
  } finally {
    exportingImage.value = false;
  }
}

const cardThemes = [
  { id: "classic", label: "极简米白", desc: "暖色纸张，沉静人文" },
  { id: "modern", label: "现代深灰", desc: "冷调无衬，高级工业感" },
  { id: "dark", label: "暗黑极简", desc: "深空黑白，适合科技与夜读" },
  { id: "glass", label: "流光渐变", desc: "梦幻微光渐变，时尚抓眼" },
] as const;
</script>

<template>
  <div class="export-studio-overlay" :class="{ 'is-dark': isDark }">
    <!-- 头部工具栏 -->
    <header class="studio-header">
      <div class="header-left">
        <span class="studio-brand">Sheaf</span>
        <span class="studio-divider">/</span>
        <span class="studio-title">导出</span>
      </div>
      <div class="header-right">
        <button class="exit-btn" @click="emit('close')">
          <span>✕ 返回编辑</span>
        </button>
      </div>
    </header>

    <!-- 工作台主体 -->
    <div class="studio-body">
      <!-- 左栏：Markdown 事实源 -->
      <section class="studio-pane pane-editor-source">
        <header class="pane-header">
          <div class="pane-title-group">
            <h2 class="pane-title">Markdown 事实源</h2>
            <p class="pane-subtitle">在此处修改文字会同步回主文件，并实时渲染卡片</p>
          </div>
        </header>
        <div class="editor-wrap">
          <MarkdownEditor v-model="modelValue" />
        </div>
      </section>

      <!-- 中栏：高保真预览区域 -->
      <section class="studio-pane pane-preview-canvas">
        <header class="pane-header">
          <h2 class="pane-title">实时卡片渲染</h2>
        </header>
        <div class="canvas-viewport" :class="[`type-${config.type}`]">
          <div class="canvas-scroller">
            <!-- 微信排版预览 -->
            <div v-if="config.type === 'wechat'" class="preview-wechat-wrapper">
              <div class="wechat-preview-toolbar">
                <span class="wechat-preview-title">公众号文章预览</span>
                <span class="wechat-preview-meta">{{ fileName }}</span>
              </div>
              <div class="preview-scroll-pane">
                <article class="wechat-article-container">
                  <div
                    class="wechat-content"
                    :style="{ fontSize: config.fontSize + 'px' }"
                  >
                    <div
                      ref="wechatRendererRef"
                      class="wechat-renderer"
                      v-html="wechatPreviewHtml"
                    />
                  </div>
                </article>
              </div>
            </div>

            <!-- 小红书或长图大预览（包含真实的渲染与截图定位容器） -->
            <div v-else class="preview-image-wrapper">
              <div
                ref="exportCaptureRef"
                class="capture-box"
                :class="[
                  `ratio-${config.cardRatio}`,
                  `theme-${config.cardTheme}`,
                  `type-${config.type}`,
                ]"
              >
                <!-- 装饰背景 -->
                <div class="card-deco-mesh"></div>

                <!-- 顶部卡片元信息 -->
                <header class="card-header">
                  <span class="card-tag">Sheaf Notes</span>
                  <span class="card-date">{{ formattedDate }}</span>
                </header>

                <!-- 正文区域 -->
                <main
                  ref="cardContentRef"
                  class="card-main-content"
                  :style="{ fontSize: config.fontSize + 'px' }"
                  v-html="renderedHtml"
                ></main>

                <!-- 底部作者栏 -->
                <footer class="card-footer">
                  <div class="author-info">
                    <div class="author-avatar">{{ authorInitial }}</div>
                    <div class="author-meta">
                      <span class="author-name">{{ config.author || "Sheaf User" }}</span>
                      <span class="author-desc">写于 Sheaf 极简排版</span>
                    </div>
                  </div>
                  <div v-if="config.showWatermark" class="watermark-logo">
                    <svg viewBox="0 0 24 24" class="logo-svg">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"
                      />
                    </svg>
                    <span class="logo-text">Sheaf</span>
                  </div>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 右栏：配置控制台 -->
      <section class="studio-pane pane-controls">
        <header class="pane-header">
          <h2 class="pane-title">版面配置</h2>
        </header>

        <div class="controls-scroller">
          <!-- 1. 导出类型切换 -->
          <section class="control-section">
            <h3 class="section-label">导出目的地</h3>
            <div class="type-switch">
              <button
                class="type-btn"
                :class="{ active: config.type === 'wechat' }"
                @click="config.type = 'wechat'"
              >
                微信公众号
              </button>
              <button
                class="type-btn"
                :class="{ active: config.type === 'xiaohongshu' }"
                @click="config.type = 'xiaohongshu'"
              >
                小红书卡片
              </button>
              <button
                class="type-btn"
                :class="{ active: config.type === 'long-image' }"
                @click="config.type = 'long-image'"
              >
                分享长图
              </button>
            </div>
          </section>

          <!-- 2. 微信排版主题 -->
          <section v-if="config.type === 'wechat'" class="control-section">
            <h3 class="section-label">公众号样式</h3>
            <p class="section-hint">样式已自动内联，无需手动调色</p>

            <div class="theme-list">
              <button
                v-for="theme in WECHAT_THEMES"
                :key="theme.id"
                class="theme-card"
                :class="{ active: config.wechatTheme === theme.id }"
                @click="config.wechatTheme = theme.id"
              >
                <span class="theme-name">{{ theme.label }}</span>
                <span class="theme-desc">{{ theme.description }}</span>
              </button>
            </div>
          </section>

          <!-- 3. 小红书卡片配置 -->
          <section v-if="config.type === 'xiaohongshu'" class="control-section">
            <h3 class="section-label">卡片设置</h3>

            <div class="form-group">
              <label class="form-label">卡片尺寸比例</label>
              <div class="ratio-switch">
                <button
                  class="ratio-btn"
                  :class="{ active: config.cardRatio === '1:1' }"
                  @click="config.cardRatio = '1:1'"
                >
                  1:1 经典方图
                </button>
                <button
                  class="ratio-btn"
                  :class="{ active: config.cardRatio === '3:4' }"
                  @click="config.cardRatio = '3:4'"
                >
                  3:4 高清竖图
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">卡片视觉风格</label>
              <div class="theme-list">
                <button
                  v-for="theme in cardThemes"
                  :key="theme.id"
                  class="theme-card"
                  :class="{ active: config.cardTheme === theme.id }"
                  @click="config.cardTheme = theme.id"
                >
                  <span class="theme-name">{{ theme.label }}</span>
                  <span class="theme-desc">{{ theme.desc }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 4. 署名与水印（非微信端适用） -->
          <section v-if="config.type !== 'wechat'" class="control-section">
            <h3 class="section-label">署名与标识</h3>

            <div class="form-group">
              <label class="form-label">卡片作者</label>
              <input
                v-model="config.author"
                type="text"
                class="form-input"
                placeholder="署名将显示在底部名片"
              />
            </div>

            <div class="form-group inline-group">
              <label class="form-label">显示 Sheaf 标识</label>
              <input
                v-model="config.showWatermark"
                type="checkbox"
                class="form-checkbox"
              />
            </div>
          </section>

          <!-- 5. 统一字号调节 -->
          <section class="control-section">
            <h3 class="section-label">排版字号</h3>
            <div class="fontsize-control">
              <button
                class="size-btn"
                :disabled="config.fontSize <= 12"
                @click="config.fontSize--"
              >
                -
              </button>
              <span class="size-val">{{ config.fontSize }}px</span>
              <button
                class="size-btn"
                :disabled="config.fontSize >= 24"
                @click="config.fontSize++"
              >
                +
              </button>
            </div>
          </section>
        </div>

        <!-- 6. 底部主操作区 -->
        <footer class="controls-footer">
          <button
            v-if="config.type === 'wechat'"
            class="btn-primary"
            :disabled="exporting"
            @click="handleCopyWechatHtml"
          >
            {{ exporting ? "正在复制 HTML…" : "一键复制内联 HTML" }}
          </button>
          <button
            v-else
            class="btn-primary"
            :disabled="exportingImage"
            @click="handleDownloadImage"
          >
            {{ exportingImage ? "正在生成超清图片…" : "保存超清图片" }}
          </button>
          <button
            class="btn-ghost"
            :disabled="exporting || exportingImage"
            @click="handleCopyPlain"
          >
            复制纯文本
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 全屏遮罩大容器 */
.export-studio-overlay {
  --wechat-preview-bg: #ffffff;
  --wechat-preview-toolbar-bg: #faf9f6;
  --wechat-preview-paper-bg: #ffffff;
  --wechat-preview-scroll-bg: linear-gradient(180deg, #ffffff 0%, #fffdfa 100%);
  --wechat-preview-title: #2a2520;
  --wechat-preview-muted: #8a8278;
  --wechat-preview-border: rgba(42, 37, 32, 0.08);
  --wechat-preview-shadow: 0 18px 60px rgba(42, 37, 32, 0.1), 0 1px 2px rgba(42, 37, 32, 0.04);
  --wechat-article-text: #2a2520;
  --wechat-article-muted: #8a8278;
  --wechat-article-accent: #3d5a4c;
  --wechat-article-code-bg: rgba(42, 37, 32, 0.06);
  --wechat-article-border: rgba(42, 37, 32, 0.14);
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--ink-bg);
  display: flex;
  flex-direction: column;
  color: var(--ink-text);
  overflow: hidden;
}

.export-studio-overlay.is-dark {
  --wechat-preview-bg: var(--ink-surface);
  --wechat-preview-toolbar-bg: #1f1c1a;
  --wechat-preview-paper-bg: #11100f;
  --wechat-preview-scroll-bg: #171513;
  --wechat-preview-title: var(--ink-text);
  --wechat-preview-muted: var(--ink-text-muted);
  --wechat-preview-border: var(--ink-border-strong);
  --wechat-preview-shadow: 0 18px 60px rgba(0, 0, 0, 0.38), 0 1px 2px rgba(0, 0, 0, 0.22);
  --wechat-article-text: #d8d2c8;
  --wechat-article-muted: #9a9288;
  --wechat-article-accent: #2bbf93;
  --wechat-article-code-bg: rgba(232, 228, 220, 0.08);
  --wechat-article-border: rgba(232, 228, 220, 0.14);
}

/* 头部样式 */
.studio-header {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: var(--ink-surface);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.studio-brand {
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 0.05em;
  color: var(--ink-accent);
}

.studio-divider {
  opacity: 0.25;
  font-size: 14px;
}

.studio-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-text-muted);
}

.exit-btn {
  background: var(--ink-border-strong);
  border: none;
  color: var(--ink-text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.exit-btn:hover {
  background: var(--ink-accent);
  color: #ffffff;
}

/* 主体内容排版 */
.studio-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* 面板基底 */
.studio-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ink-bg);
  border-right: 1px solid var(--ink-border);
}

.pane-header {
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--ink-border-strong);
  background: var(--ink-surface);
  flex-shrink: 0;
}

.pane-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

/* 左面板：事实源编辑器 */
.pane-editor-source {
  width: 40%;
}

.pane-title-group {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.pane-subtitle {
  font-size: 10px;
  color: var(--ink-text-muted);
  margin: 2px 0 0;
  opacity: 0.8;
}

.editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--ink-bg);
}

/* 中面板：高保真预览画布 */
.pane-preview-canvas {
  flex: 1;
  background: var(--ink-bg-preview);
}

.canvas-viewport {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;
}

/* 画布棋盘格背景 */
.canvas-viewport::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--ink-border) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.45;
}

.canvas-scroller {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  box-sizing: border-box;
}

/* 右面板：控制器 */
.pane-controls {
  width: 320px;
  flex-shrink: 0;
  border-right: none;
  background: var(--ink-surface);
}

.controls-scroller {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.section-hint {
  font-size: 11px;
  color: var(--ink-text-muted);
  margin: 0 0 4px;
  line-height: 1.45;
}

/* 微信排版 */
.preview-wechat-wrapper {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  height: min(720px, 100%);
  background: var(--wechat-preview-bg);
  border: 1px solid var(--wechat-preview-border);
  border-radius: 14px;
  box-shadow: var(--wechat-preview-shadow);
  overflow: hidden;
  z-index: 10;
}

.wechat-preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  color: var(--wechat-preview-muted);
  background: var(--wechat-preview-toolbar-bg);
  border-bottom: 1px solid var(--wechat-preview-border);
}

.wechat-preview-title {
  color: var(--wechat-preview-title);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.wechat-preview-meta {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-scroll-pane {
  flex: 1;
  overflow-y: auto;
  padding: 34px 42px 46px;
  background: var(--wechat-preview-scroll-bg);
}

.wechat-article-container {
  background: var(--wechat-preview-paper-bg);
}

.wechat-content :deep(section) {
  font-size: inherit !important;
}

.export-studio-overlay.is-dark .wechat-content :deep(section),
.export-studio-overlay.is-dark .wechat-content :deep(h1),
.export-studio-overlay.is-dark .wechat-content :deep(h2),
.export-studio-overlay.is-dark .wechat-content :deep(h3),
.export-studio-overlay.is-dark .wechat-content :deep(h4),
.export-studio-overlay.is-dark .wechat-content :deep(p),
.export-studio-overlay.is-dark .wechat-content :deep(li),
.export-studio-overlay.is-dark .wechat-content :deep(code),
.export-studio-overlay.is-dark .wechat-content :deep(pre),
.export-studio-overlay.is-dark .wechat-content :deep(th),
.export-studio-overlay.is-dark .wechat-content :deep(td),
.export-studio-overlay.is-dark .wechat-content :deep(strong),
.export-studio-overlay.is-dark .wechat-content :deep(em) {
  color: var(--wechat-article-text) !important;
}

.export-studio-overlay.is-dark .wechat-content :deep(h1),
.export-studio-overlay.is-dark .wechat-content :deep(hr),
.export-studio-overlay.is-dark .wechat-content :deep(th),
.export-studio-overlay.is-dark .wechat-content :deep(td) {
  border-color: var(--wechat-article-border) !important;
}

.export-studio-overlay.is-dark .wechat-content :deep(h2),
.export-studio-overlay.is-dark .wechat-content :deep(a) {
  color: var(--wechat-article-accent) !important;
}

.export-studio-overlay.is-dark .wechat-content :deep(blockquote) {
  color: var(--wechat-article-muted) !important;
  border-left-color: var(--wechat-article-border) !important;
}

.export-studio-overlay.is-dark .wechat-content :deep(code),
.export-studio-overlay.is-dark .wechat-content :deep(pre),
.export-studio-overlay.is-dark .wechat-content :deep(th) {
  background-color: var(--wechat-article-code-bg) !important;
}

.export-studio-overlay.is-dark .wechat-content :deep(pre code) {
  background: none !important;
}

.wechat-content :deep(.mermaid),
.wechat-content :deep(.katex-display),
.card-main-content :deep(.mermaid),
.card-main-content :deep(.katex-display) {
  overflow-x: auto;
  text-align: center;
}

.wechat-content :deep(.mermaid),
.card-main-content :deep(.mermaid) {
  margin: 20px 0;
  background: transparent;
}

.wechat-content :deep(.mermaid svg),
.card-main-content :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
}

.wechat-content :deep(.mermaid-error),
.card-main-content :deep(.mermaid-error) {
  padding: 1em;
  text-align: left;
  white-space: pre-wrap;
  background: var(--wechat-article-code-bg);
  border-radius: 8px;
}

/* 小红书卡片 / 长图大预览容器 */
.preview-image-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  z-index: 10;
}

.capture-box {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* 宽高比例适配 */
.capture-box.type-xiaohongshu {
  width: 380px;
}

.capture-box.type-xiaohongshu.ratio-1-1 {
  aspect-ratio: 1/1;
  height: 380px;
}

.capture-box.type-xiaohongshu.ratio-3-4 {
  aspect-ratio: 3/4;
  height: 506px;
}

.capture-box.type-long-image {
  width: 420px;
  min-height: 480px;
}

/* 小红书非截图状态下正文溢出滚动 */
.capture-box.type-xiaohongshu .card-main-content {
  flex: 1;
  overflow-y: auto;
}

/* 1. 经典米白主题 */
.theme-classic {
  background: #fbf9f4;
  color: #2e2a24;
  border: 1px solid #eae5db;
}
.theme-classic .card-deco-mesh {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image: radial-gradient(#000 1px, transparent 1px);
  background-size: 16px 16px;
  pointer-events: none;
}
.theme-classic .card-tag {
  background: rgba(46, 42, 36, 0.06);
  color: #2e2a24;
}
.theme-classic .card-date {
  color: #8c8579;
}
.theme-classic .author-avatar {
  background: #3d5a4c;
  color: #ffffff;
}
.theme-classic .author-name {
  color: #2e2a24;
}
.theme-classic .author-desc {
  color: #8c8579;
}
.theme-classic .watermark-logo {
  color: rgba(46, 42, 36, 0.25);
}

/* 2. 现代冷灰主题 */
.theme-modern {
  background: linear-gradient(135deg, #f4f5f6 0%, #e9ebed 100%);
  color: #1a1a1b;
  border: 1px solid rgba(0, 0, 0, 0.05);
}
.theme-modern .card-tag {
  background: #1a1a1b;
  color: #ffffff;
}
.theme-modern .card-date {
  color: #7d8085;
}
.theme-modern .author-avatar {
  background: #1a1a1b;
  color: #ffffff;
}
.theme-modern .author-name {
  color: #1a1a1b;
}
.theme-modern .author-desc {
  color: #7d8085;
}
.theme-modern .watermark-logo {
  color: rgba(0, 0, 0, 0.3);
}

/* 3. 暗黑极简 */
.theme-dark {
  background: linear-gradient(135deg, #1e2022 0%, #101112 100%);
  color: #e3e4e6;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.theme-dark .card-tag {
  background: rgba(255, 255, 255, 0.12);
  color: #e3e4e6;
}
.theme-dark .card-date {
  color: #8a8d91;
}
.theme-dark .author-avatar {
  background: #ffffff;
  color: #101112;
}
.theme-dark .author-name {
  color: #ffffff;
}
.theme-dark .author-desc {
  color: #8a8d91;
}
.theme-dark .watermark-logo {
  color: rgba(255, 255, 255, 0.2);
}

/* 4. 流光玻璃渐变 */
.theme-glass {
  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #a1c4fd 100%);
  color: #1a1a1b;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.theme-glass::before {
  content: "";
  position: absolute;
  inset: 12px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.theme-glass > * {
  position: relative;
  z-index: 2;
}
.theme-glass .card-tag {
  background: #1a1a1b;
  color: #ffffff;
}
.theme-glass .card-date {
  color: #55585d;
}
.theme-glass .author-avatar {
  background: #1a1a1b;
  color: #ffffff;
}
.theme-glass .author-name {
  color: #1a1a1b;
}
.theme-glass .author-desc {
  color: #55585d;
}
.theme-glass .watermark-logo {
  color: rgba(0, 0, 0, 0.35);
}

/* 卡片细部样式 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-shrink: 0;
}

.card-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 100px;
}

.card-date {
  font-size: 10px;
  font-weight: 500;
  font-family: monospace;
}

/* 卡片排版 */
.card-main-content {
  line-height: 1.8;
  text-align: justify;
}

.card-main-content :deep(h1),
.card-main-content :deep(h2),
.card-main-content :deep(h3) {
  line-height: 1.4;
  margin: 1.5em 0 0.8em;
  font-weight: 600;
}

.card-main-content :deep(h1) {
  font-size: 1.4em;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding-bottom: 0.3em;
}

.theme-dark .card-main-content :deep(h1) {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.card-main-content :deep(h2) {
  font-size: 1.2em;
}

.card-main-content :deep(h3) {
  font-size: 1.1em;
}

.card-main-content :deep(p) {
  margin: 0 0 1em;
}

.card-main-content :deep(blockquote) {
  margin: 0 0 1.2em;
  padding-left: 12px;
  border-left: 3px solid currentColor;
  opacity: 0.8;
  font-style: italic;
}

.card-main-content :deep(ul),
.card-main-content :deep(ol) {
  margin: 0 0 1.2em;
  padding-left: 20px;
}

.card-main-content :deep(li) {
  margin-bottom: 0.4em;
}

.card-main-content :deep(code) {
  font-family: monospace;
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 5px;
  border-radius: 4px;
}

.theme-dark .card-main-content :deep(code) {
  background: rgba(255, 255, 255, 0.1);
}

.card-main-content :deep(pre) {
  background: rgba(0, 0, 0, 0.03);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0 0 1.2em;
}

.theme-dark .card-main-content :deep(pre) {
  background: rgba(255, 255, 255, 0.05);
}

.card-main-content :deep(pre code) {
  background: none;
  padding: 0;
}

.card-main-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 10px auto;
  display: block;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.theme-dark .card-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.author-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.author-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.author-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.author-name {
  font-size: 11px;
  font-weight: 600;
}

.author-desc {
  font-size: 9px;
}

.watermark-logo {
  display: flex;
  align-items: center;
  gap: 4px;
}

.logo-svg {
  width: 12px;
  height: 12px;
}

.logo-text {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* 控制台目的地切换 */
.type-switch {
  display: flex;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  padding: 2px;
}

.type-btn {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 2px;
  border-radius: 6px;
  color: var(--ink-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.type-btn:hover {
  color: var(--ink-text);
}

.type-btn.active {
  color: var(--ink-text);
  background: var(--ink-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* 卡片比例切换 */
.ratio-switch {
  display: flex;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  padding: 2px;
}

.ratio-btn {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  padding: 5px;
  border-radius: 4px;
  color: var(--ink-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
}

.ratio-btn.active {
  color: var(--ink-text);
  background: var(--ink-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* 微信/卡片风格配置 */
.theme-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  text-align: left;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
  cursor: pointer;
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
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-text);
}

.theme-desc {
  font-size: 10px;
  color: var(--ink-text-muted);
  line-height: 1.4;
}

/* 表单元素 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group.inline-group {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.form-label {
  font-size: 11px;
  color: var(--ink-text-muted);
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  color: var(--ink-text);
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--ink-accent);
}

.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--ink-accent);
  cursor: pointer;
}

/* 字号控制 */
.fontsize-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  padding: 4px 10px;
}

.size-btn {
  width: 24px;
  height: 24px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  color: var(--ink-text);
  cursor: pointer;
}

.size-btn:hover:not(:disabled) {
  background: var(--ink-border-strong);
}

.size-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.size-val {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-text);
}

/* 控制栏页脚 */
.controls-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--ink-border);
  background: var(--ink-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.btn-primary {
  width: 100%;
  padding: 10px;
  background: var(--ink-accent);
  color: #ffffff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-ghost {
  width: 100%;
  padding: 10px;
  background: transparent;
  color: var(--ink-text-muted);
  border: none;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-ghost:hover {
  background: var(--ink-border);
  color: var(--ink-text);
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
