<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Undo2 } from "@lucide/vue";
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
import { isTauri } from "@tauri-apps/api/core";
import { toPng } from "html-to-image";
import { save, message } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useExportTypography } from "../composables/useExportTypography";

const props = defineProps<{
  docFilePath?: string | null;
  fileName: string;
  isDark: boolean;
  /** 嵌入演示框等非全屏容器时使用 */
  embedded?: boolean;
}>();

async function studioMessage(
  text: string,
  kind: "info" | "error" = "info",
) {
  if (!isTauri()) return;
  await message(text, { title: "Sheaf 导出", kind });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const modelValue = defineModel<string>({ required: true });

const emit = defineEmits<{
  close: [];
}>();

const { settings: exportTypographySettings } = useExportTypography();

// 导出配置状态
const config = ref({
  type: "wechat" as "wechat" | "xiaohongshu" | "long-image",
  wechatTheme: "classic" as "classic" | "editorial" | "minimal",
  cardTheme: "classic" as "classic" | "modern" | "dark",
  author: "Sheaf Writer",
  showWatermark: true,
  fontSize: 15,
});

const XIAOHONGSHU_EXPORT_SIZE = {
  width: 1242,
  height: 1660,
} as const;
const XIAOHONGSHU_EXPORT_PIXEL_RATIO = 3;
const XIAOHONGSHU_CAPTURE_SIZE = {
  width: XIAOHONGSHU_EXPORT_SIZE.width / XIAOHONGSHU_EXPORT_PIXEL_RATIO,
  height: XIAOHONGSHU_EXPORT_SIZE.height / XIAOHONGSHU_EXPORT_PIXEL_RATIO,
} as const;

const exporting = ref(false);
const exportingImage = ref(false);
const exportCaptureRef = ref<HTMLElement | null>(null);
const wechatRendererRef = ref<HTMLElement | null>(null);
const cardContentRef = ref<HTMLElement | null>(null);
const cardMeasureContentRef = ref<HTMLElement | null>(null);
const measureCardHtml = ref("");
const paginatedCardFontSize = ref(config.value.fontSize);
const cardPages = ref<string[]>([]);
const currentCardIndex = ref(0);
const cardPaginationPending = ref(false);

let paginationRunId = 0;
let measureHostEl: HTMLDivElement | null = null;
let measureSurfaceEl: HTMLElement | null = null;
let measureSurfaceSignature = "";

// 渲染 Markdown (微信和大图片预览使用)
const renderedHtml = computed(() => {
  void exportTypographySettings.chineseEnglishSpacing;
  return renderMarkdown(modelValue.value, props.docFilePath ?? null);
});

// 微信预览和复制导出必须走同一条样式管线，否则预览会退回浏览器默认样式。
const wechatPreviewHtml = computed(() => {
  void exportTypographySettings.chineseEnglishSpacing;
  return buildWechatHtml(
    modelValue.value,
    config.value.wechatTheme,
    props.docFilePath ?? null,
  );
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

const isXiaohongshuCard = computed(() => config.value.type === "xiaohongshu");
const isLongImage = computed(() => config.value.type === "long-image");
const currentCardHtml = computed(() => {
  if (!isXiaohongshuCard.value) return renderedHtml.value;
  if (cardPaginationPending.value && !cardPages.value.length) return "";
  return cardPages.value[currentCardIndex.value] ?? renderedHtml.value;
});
const cardPageCount = computed(() => {
  if (!isXiaohongshuCard.value) return 1;
  return cardPages.value.length || 1;
});
const cardPaginationText = computed(() => {
  if (cardPaginationPending.value) return "分页计算中...";
  return `${currentCardIndex.value + 1} / ${cardPageCount.value}`;
});

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function extractCardBlocks(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();

  const blocks: string[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      blocks.push(...splitPaginatedCardElement(node as HTMLElement));
      continue;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (!text) continue;
      const p = document.createElement("p");
      p.textContent = text;
      blocks.push(p.outerHTML);
    }
  }

  return compactPaginatedCardBlocks(blocks);
}

function splitPaginatedCardElement(element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "table") {
    return splitPaginatedCardTable(element as HTMLTableElement);
  }
  if (tagName === "ul" || tagName === "ol") {
    return splitPaginatedCardList(element);
  }
  return [element.outerHTML];
}

function splitPaginatedCardList(element: HTMLElement) {
  const items = Array.from(element.children).filter(
    (child): child is HTMLElement => child.tagName.toLowerCase() === "li",
  );
  if (items.length <= 1) return [element.outerHTML];

  const blocks: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const list = element.cloneNode(false) as HTMLElement;
    list.appendChild(items[index].cloneNode(true));
    blocks.push(list.outerHTML);
  }
  return blocks;
}

function splitPaginatedCardTable(table: HTMLTableElement) {
  const rows = Array.from(table.querySelectorAll("tbody tr, table > tr"));
  if (rows.length <= 2) return [table.outerHTML];

  const caption = table.querySelector(":scope > caption");
  const colGroups = Array.from(table.querySelectorAll(":scope > colgroup"));
  const head = table.querySelector(":scope > thead");
  const foot = table.querySelector(":scope > tfoot");
  const blocks: string[] = [];

  for (let index = 0; index < rows.length; index += 2) {
    const chunk = table.cloneNode(false) as HTMLTableElement;
    if (caption) chunk.appendChild(caption.cloneNode(true));
    for (const colGroup of colGroups) {
      chunk.appendChild(colGroup.cloneNode(true));
    }
    if (head) chunk.appendChild(head.cloneNode(true));

    const body = document.createElement("tbody");
    for (const row of rows.slice(index, index + 2)) {
      body.appendChild(row.cloneNode(true));
    }
    chunk.appendChild(body);
    if (foot && index + 2 >= rows.length) chunk.appendChild(foot.cloneNode(true));
    blocks.push(chunk.outerHTML);
  }

  return blocks;
}

function isHeadingBlock(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  const first = root.firstElementChild;
  return !!first && /^H[1-6]$/.test(first.tagName);
}

function compactPaginatedCardBlocks(blocks: string[]) {
  const compacted: string[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (isHeadingBlock(block)) {
      let group = block;
      let cursor = index + 1;
      while (cursor < blocks.length && isHeadingBlock(blocks[cursor])) {
        group += blocks[cursor];
        cursor += 1;
      }
      if (cursor < blocks.length) {
        group += blocks[cursor];
        compacted.push(group);
        index = cursor;
      } else {
        compacted.push(group);
        index = cursor - 1;
      }
      continue;
    }
    compacted.push(block);
  }
  return compacted;
}

function splitTextIntoCardChunks(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > maxChars) {
    const windowText = rest.slice(0, maxChars);
    const breakIndex = Math.max(
      windowText.lastIndexOf("。"),
      windowText.lastIndexOf("；"),
      windowText.lastIndexOf(";"),
      windowText.lastIndexOf(". "),
      windowText.lastIndexOf("，"),
      windowText.lastIndexOf(", "),
    );
    const safeIndex = breakIndex > maxChars * 0.45 ? breakIndex + 1 : maxChars;
    chunks.push(rest.slice(0, safeIndex).trim());
    rest = rest.slice(safeIndex).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function splitOversizedCardBlock(html: string, heightRatio: number) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  const first = root.firstElementChild as HTMLElement | null;
  const text = (root.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!first || text.length < 120) return [html];

  const maxChars = Math.min(
    220,
    Math.max(70, Math.floor(text.length * Math.max(0.2, heightRatio) * 0.68)),
  );
  const chunks = splitTextIntoCardChunks(text, maxChars);
  if (chunks.length <= 1) return [html];

  const tagName = first.tagName.toLowerCase();
  if (tagName === "ul" || tagName === "ol") {
    return chunks.map((chunk) => {
      const list = first.cloneNode(false) as HTMLElement;
      const item = document.createElement("li");
      item.textContent = chunk;
      list.appendChild(item);
      return list.outerHTML;
    });
  }
  if (tagName === "pre") {
    return chunks.map((chunk) => {
      const pre = first.cloneNode(false) as HTMLElement;
      const code = document.createElement("code");
      code.textContent = chunk;
      pre.appendChild(code);
      return pre.outerHTML;
    });
  }
  if (tagName === "blockquote") {
    return chunks.map((chunk) => {
      const quote = first.cloneNode(false) as HTMLElement;
      quote.textContent = chunk;
      return quote.outerHTML;
    });
  }

  return chunks.map((chunk) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = chunk;
    return paragraph.outerHTML;
  });
}

function buildSplitCardBlock(original: HTMLElement, text: string, prefixHtml = "") {
  const tagName = original.tagName.toLowerCase();
  if (tagName === "ul" || tagName === "ol") {
    const list = original.cloneNode(false) as HTMLElement;
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
    return prefixHtml + list.outerHTML;
  }
  if (tagName === "blockquote") {
    const quote = original.cloneNode(false) as HTMLElement;
    quote.textContent = text;
    return prefixHtml + quote.outerHTML;
  }
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return prefixHtml + paragraph.outerHTML;
}

function readSplittableCardBlock(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  const elements = Array.from(root.children) as HTMLElement[];
  if (elements.length > 1 && /^H[1-6]$/.test(elements[0].tagName)) {
    const bodyElements = elements.slice(1);
    if (!bodyElements.length || bodyElements.some((element) => element.tagName.toLowerCase() === "table")) {
      return null;
    }
    const text = bodyElements.map((element) => element.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
    if (text.length < 24) return null;
    return {
      element: bodyElements[0],
      prefixHtml: elements[0].outerHTML,
      text,
    };
  }

  if (elements.length !== 1) return null;

  const element = elements[0];
  const tagName = element.tagName.toLowerCase();
  if (["table", "pre", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
    return null;
  }

  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 24) return null;

  return { element, prefixHtml: "", text };
}

function snapCardSplitIndex(text: string, index: number) {
  const minIndex = Math.max(1, index - 18);
  const windowText = text.slice(0, index);
  const breakIndex = Math.max(
    windowText.lastIndexOf("。"),
    windowText.lastIndexOf("；"),
    windowText.lastIndexOf(";"),
    windowText.lastIndexOf(". "),
    windowText.lastIndexOf("，"),
    windowText.lastIndexOf(", "),
    windowText.lastIndexOf(" "),
  );
  return breakIndex >= minIndex ? breakIndex + 1 : index;
}

function normalizeCardSplitText(head: string, tail: string) {
  let normalizedHead = head.trim();
  let normalizedTail = tail.trim();
  while (/^[。；;，,、.!?！？]/.test(normalizedTail)) {
    normalizedHead += normalizedTail[0];
    normalizedTail = normalizedTail.slice(1).trim();
  }
  return { head: normalizedHead, tail: normalizedTail };
}

async function splitCardBlockToFitPage(
  currentHtml: string,
  block: string,
  targetHeight: number,
  runId: number,
) {
  const parsed = readSplittableCardBlock(block);
  if (!parsed) return null;

  let low = 1;
  let high = parsed.text.length;
  let bestIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildSplitCardBlock(
      parsed.element,
      parsed.text.slice(0, mid),
      parsed.prefixHtml,
    );
    const candidateHeight = await measureContentHeight(currentHtml + candidate, runId);
    if (runId !== paginationRunId) return null;

    if (candidateHeight <= targetHeight) {
      bestIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const splitIndex = snapCardSplitIndex(parsed.text, bestIndex);
  if (splitIndex < Math.min(18, parsed.text.length)) return null;

  const { head: headText, tail: tailText } = normalizeCardSplitText(
    parsed.text.slice(0, splitIndex),
    parsed.text.slice(splitIndex),
  );
  if (!headText || !tailText) return null;

  return [
    buildSplitCardBlock(parsed.element, headText, parsed.prefixHtml),
    buildSplitCardBlock(parsed.element, tailText),
  ];
}

function ensureMeasureSurface() {
  const signature = [
    config.value.cardTheme,
    config.value.author,
    config.value.showWatermark ? "1" : "0",
    formattedDate.value,
  ].join("|");

  if (
    measureHostEl &&
    measureSurfaceEl &&
    measureSurfaceSignature === signature &&
    document.body.contains(measureHostEl)
  ) {
    return measureSurfaceEl;
  }

  const templateHost = cardMeasureContentRef.value?.closest(
    ".capture-box-measure",
  ) as HTMLDivElement | null;
  if (!templateHost) {
    throw new Error("Failed to locate the template XHS measurement surface.");
  }

  if (measureHostEl && measureHostEl.parentElement) {
    measureHostEl.parentElement.removeChild(measureHostEl);
  }

  measureHostEl = templateHost.cloneNode(true) as HTMLDivElement;
  document.body.appendChild(measureHostEl);

  measureSurfaceSignature = signature;
  measureSurfaceEl = measureHostEl.querySelector(".card-main-content") as HTMLElement | null;
  if (!measureSurfaceEl) {
    throw new Error("Failed to initialize XHS measurement surface.");
  }

  measureSurfaceEl.innerHTML = "";
  return measureSurfaceEl;
}

async function measureContentHeight(html: string, runId: number) {
  const contentEl = ensureMeasureSurface();
  contentEl.innerHTML = `<div class="card-measure-inner">${html}</div>`;
  const measureTarget =
    (contentEl.firstElementChild as HTMLElement | null) ?? contentEl;
  await nextTick();
  await document.fonts.ready;
  await waitForAnimationFrame();
  if (runId !== paginationRunId) return Number.POSITIVE_INFINITY;

  if (html.includes("data-mermaid-source")) {
    await renderMermaidIn(measureTarget, shouldRenderMermaidAsDark.value);
    await nextTick();
    await waitForAnimationFrame();
    if (runId !== paginationRunId) return Number.POSITIVE_INFINITY;
  }

  const measuredHeight = Math.max(
    measureTarget.scrollHeight,
    measureTarget.getBoundingClientRect().height,
  );
  return Math.ceil(measuredHeight);
}

async function paginateXiaohongshuCards(
  sourceHtml: string,
  fontSize: number,
  runId: number,
) {
  const blocks = extractCardBlocks(sourceHtml);
  const pages: string[] = [];
  const contentEl = cardMeasureContentRef.value;
  if (!contentEl) return { pages: [sourceHtml], fontSize };

  contentEl.style.fontSize = `${fontSize}px`;
  await nextTick();
  await document.fonts.ready;
  await waitForAnimationFrame();
  if (runId !== paginationRunId) return null;

  const availableHeight = contentEl.clientHeight;
  const targetHeight = Math.max(1, Math.floor(availableHeight - 10));
  const hardHeight = targetHeight;

  let currentBlocks: string[] = [];
  let currentRenderedHtml = "";

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    if (runId !== paginationRunId) {
      return null;
    }

    const candidateBlocks = [...currentBlocks, block];
    const candidateHtml = candidateBlocks.join("");
    const candidateHeight = await measureContentHeight(candidateHtml, runId);
    if (runId !== paginationRunId) {
      return null;
    }
    if (candidateHeight <= targetHeight) {
      currentBlocks = candidateBlocks;
      currentRenderedHtml = candidateHtml;
      continue;
    }

    if (currentBlocks.length) {
      const splitBlocks = await splitCardBlockToFitPage(
        currentRenderedHtml || currentBlocks.join(""),
        block,
        targetHeight,
        runId,
      );
      if (runId !== paginationRunId) return null;
      if (splitBlocks && splitBlocks.length > 1) {
        blocks.splice(blockIndex, 1, ...splitBlocks);
        blockIndex -= 1;
        continue;
      }

      pages.push(currentRenderedHtml || currentBlocks.join(""));
      currentBlocks = [];
      currentRenderedHtml = "";
      blockIndex -= 1;
      continue;
    }

    if (candidateHeight > hardHeight) {
      const splitBlocks = splitOversizedCardBlock(block, targetHeight / candidateHeight);
      if (splitBlocks.length > 1) {
        blocks.splice(blockIndex, 1, ...splitBlocks);
        blockIndex -= 1;
        continue;
      }
    }

    pages.push(candidateHtml);
  }

  if (currentBlocks.length) {
    pages.push(currentRenderedHtml || currentBlocks.join(""));
  }

  return { pages, fontSize };
}

async function rebuildCardPagination() {
  const runId = ++paginationRunId;

  if (!isXiaohongshuCard.value) {
    cardPaginationPending.value = false;
    cardPages.value = [renderedHtml.value];
    currentCardIndex.value = 0;
    paginatedCardFontSize.value = config.value.fontSize;
    return;
  }

  cardPaginationPending.value = true;
  await nextTick();
  await document.fonts.ready;
  if (runId !== paginationRunId) return;

  const contentEl = cardMeasureContentRef.value;
  if (!contentEl) {
    if (runId === paginationRunId) cardPaginationPending.value = false;
    return;
  }

  const maxFontSize = Math.min(Math.max(Math.round(config.value.fontSize), 12), 24);
  const minFontSize = 11;

  try {
    for (let size = maxFontSize; size >= minFontSize; size--) {
      if (runId !== paginationRunId) return;

      const result = await paginateXiaohongshuCards(renderedHtml.value, size, runId);
      if (!result) continue;

      if (runId !== paginationRunId) return;

      cardPages.value = result.pages.length ? result.pages : [renderedHtml.value];
      currentCardIndex.value = 0;
      paginatedCardFontSize.value = result.fontSize;
      return;
    }

    cardPages.value = [renderedHtml.value];
    currentCardIndex.value = 0;
    paginatedCardFontSize.value = minFontSize;
  } finally {
    if (runId === paginationRunId) {
      cardPaginationPending.value = false;
    }
  }
}

async function syncPreviewLayout() {
  if (isXiaohongshuCard.value) {
    await rebuildCardPagination();
    return;
  }

  cardPages.value = [renderedHtml.value];
  currentCardIndex.value = 0;
  paginatedCardFontSize.value = config.value.fontSize;
  await renderVisibleMermaid();
}

function goToPreviousCard() {
  if (currentCardIndex.value <= 0) return;
  currentCardIndex.value -= 1;
}

function goToNextCard() {
  if (currentCardIndex.value >= cardPageCount.value - 1) return;
  currentCardIndex.value += 1;
}

async function renderVisibleMermaid() {
  await nextTick();
  if (wechatRendererRef.value) {
    await renderMermaidIn(wechatRendererRef.value, props.isDark);
  }
  if (cardContentRef.value && isLongImage.value) {
    await renderMermaidIn(cardContentRef.value, shouldRenderMermaidAsDark.value);
  }
}

onMounted(() => {
  void syncPreviewLayout();
});

watch(
  [
    renderedHtml,
    wechatPreviewHtml,
    () => config.value.type,
    () => config.value.cardTheme,
    () => config.value.fontSize,
    () => config.value.author,
    () => config.value.showWatermark,
    () => props.isDark,
  ],
  () => {
    void syncPreviewLayout();
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

function splitPathExtension(path: string) {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex <= separatorIndex) return { base: path, extension: "" };
  return {
    base: path.slice(0, dotIndex),
    extension: path.slice(dotIndex),
  };
}

function cardImageFileName(pageIndex: number, pageCount: number) {
  const cardSuffix =
    pageCount > 1 ? `-card-${String(pageIndex + 1).padStart(2, "0")}` : "";
  return `${props.fileName || "untitled"}_${config.value.type}${cardSuffix}.png`;
}

async function captureExportImage(el: HTMLElement) {
  await waitForAnimationFrame();
  const isXiaohongshu = config.value.type === "xiaohongshu";
  const captureWidth = isXiaohongshu
    ? XIAOHONGSHU_CAPTURE_SIZE.width
    : el.offsetWidth;
  const captureHeight = isXiaohongshu
    ? XIAOHONGSHU_CAPTURE_SIZE.height
    : config.value.type === "long-image"
      ? el.scrollHeight
      : el.offsetHeight;

  return toPng(el, {
    cacheBust: true,
    pixelRatio: isXiaohongshu ? XIAOHONGSHU_EXPORT_PIXEL_RATIO : 2,
    backgroundColor: "transparent",
    skipFonts: true,
    width: captureWidth,
    height: captureHeight,
    canvasWidth: captureWidth,
    canvasHeight: captureHeight,
    style: {
      transform: "scale(1)",
      transformOrigin: "top left",
      width: `${captureWidth}px`,
      height: `${captureHeight}px`,
    },
  });
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
      await studioMessage(
        "已复制微信公众号格式 HTML！请在微信公众号编辑器直接粘贴。",
      );
    } else {
      await studioMessage(result.message, "error");
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
      await studioMessage("已复制 Markdown 纯文本至剪贴板。");
    } else {
      await studioMessage(result.message, "error");
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
    await studioMessage("未找到预览节点，请重试。", "error");
    return;
  }

  exportingImage.value = true;
  let originalScrollTop = 0;
  const originalCardIndex = currentCardIndex.value;
  try {
    // 微信模式下不应该导出图片
    if (config.value.type === "wechat") return;

    // 隐藏可能影响排版的原生滚动条，确保截图完整
    originalScrollTop = el.scrollTop;
    el.scrollTop = 0;

    // 导出前重新同步一次预览，确保截图与屏幕一致
    await syncPreviewLayout();

    const pageCount = isXiaohongshuCard.value ? cardPageCount.value : 1;
    const imageJobs: { dataUrl: string; fileName: string }[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      if (isXiaohongshuCard.value) {
        currentCardIndex.value = pageIndex;
        await nextTick();
      }
      imageJobs.push({
        dataUrl: await captureExportImage(el),
        fileName: cardImageFileName(pageIndex, pageCount),
      });
    }

    if (isTauri()) {
      const selectedPath = await save({
        title: "保存图片至本地",
        defaultPath: imageJobs[0]?.fileName ?? cardImageFileName(0, pageCount),
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!selectedPath) return;
      const selectedParts = splitPathExtension(selectedPath);
      const selectedBase =
        imageJobs.length > 1
          ? selectedParts.base.replace(/-card-\d+$/i, "")
          : selectedParts.base;
      for (let index = 0; index < imageJobs.length; index++) {
        const targetPath =
          imageJobs.length === 1
            ? selectedPath
            : `${selectedBase}-card-${String(index + 1).padStart(2, "0")}${selectedParts.extension || ".png"}`;
        await writeFile(targetPath, dataUrlToBytes(imageJobs[index].dataUrl));
      }
      await studioMessage(
        imageJobs.length > 1
          ? `图片保存成功，共 ${imageJobs.length} 张。`
          : "图片保存成功！",
      );
    } else {
      for (const image of imageJobs) {
        downloadDataUrl(image.dataUrl, image.fileName);
      }
    }
  } catch (error: any) {
    console.error("Export image error:", error);
    await studioMessage(error?.message || "图片导出失败，请重试。", "error");
  } finally {
    currentCardIndex.value = originalCardIndex;
    await nextTick();
    el.scrollTop = originalScrollTop;
    exportingImage.value = false;
  }
}

const cardThemes = [
  { id: "classic", label: "极简米白", desc: "暖色纸张，沉静人文" },
  { id: "modern", label: "现代深灰", desc: "冷调无衬，高级工业感" },
  { id: "dark", label: "暗黑极简", desc: "深空黑白，适合科技与夜读" },
] as const;
</script>

<template>
  <div
    class="export-studio-overlay"
    :class="{ 'is-dark': isDark, 'is-embedded': embedded }"
  >
    <!-- 头部工具栏 -->
    <header class="studio-header">
      <div class="header-left">
        <span class="studio-brand">Sheaf</span>
        <span class="studio-divider">/</span>
        <span class="studio-title">导出</span>
      </div>
      <div class="header-right">
        <button class="exit-btn" title="返回编辑" @click="emit('close')">
          <Undo2 :size="14" aria-hidden="true" />
          <span>返回编辑</span>
        </button>
      </div>
    </header>

    <!-- 工作台主体 -->
    <div class="studio-body">
      <!-- 左栏：Markdown 事实源 -->
      <section class="studio-pane pane-editor-source">
        <!-- <header class="pane-header">
          <div class="pane-title-group">
            <h2 class="pane-title">Markdown 事实源</h2>
            <p class="pane-subtitle">在此处修改文字会同步回主文件，并实时渲染卡片</p>
          </div>
        </header> -->
        <div class="editor-wrap">
          <MarkdownEditor v-model="modelValue" />
        </div>
      </section>

      <!-- 中栏：高保真预览区域 -->
      <section class="studio-pane pane-preview-canvas">
        <!-- <header class="pane-header">
          <h2 class="pane-title">实时卡片渲染</h2>
        </header> -->
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
              <div class="capture-stack">
                <div
                  ref="exportCaptureRef"
                  class="capture-box"
                  :class="[
                    `theme-${config.cardTheme}`,
                    `type-${config.type}`,
                  ]"
                >
                  <!-- 装饰背景 -->
                  <div class="card-deco-mesh"></div>

                  <!-- 顶部卡片元信息 -->
                  <header class="card-header">
                    <span class="card-tag">Sheaf Notes</span>
                    <span class="card-date">
                      {{ formattedDate }}
                      <span v-if="isXiaohongshuCard" class="card-page-count">
                        {{ cardPaginationPending ? "计算中" : `${currentCardIndex + 1}/${cardPageCount}` }}
                      </span>
                    </span>
                  </header>

                  <!-- 正文区域 -->
                  <main
                    ref="cardContentRef"
                    class="card-main-content"
                    :class="{ 'is-paginating': cardPaginationPending }"
                    :style="{ fontSize: paginatedCardFontSize + 'px' }"
                  >
                    <div class="card-measure-inner" v-html="currentCardHtml"></div>
                  </main>

                  <div v-if="cardPaginationPending" class="card-loading-mask">
                    <span class="card-loading-spinner" aria-hidden="true"></span>
                    <span>正在计算分页...</span>
                  </div>

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

              <div v-if="isXiaohongshuCard" class="card-pagination-rail">
                <button
                  class="card-pagination-btn"
                  :disabled="cardPaginationPending || currentCardIndex === 0"
                  @click="goToPreviousCard"
                >
                  上一张
                </button>
                <span class="card-pagination-indicator">
                  {{ cardPaginationText }}
                </span>
                <button
                  class="card-pagination-btn"
                  :disabled="cardPaginationPending || currentCardIndex >= cardPageCount - 1"
                  @click="goToNextCard"
                >
                  下一张
                </button>
              </div>

              <div
                v-if="isXiaohongshuCard"
                class="capture-box capture-box-measure"
                :class="[
                  `theme-${config.cardTheme}`,
                  `type-${config.type}`,
                ]"
              >
                <div class="card-deco-mesh"></div>
                <header class="card-header">
                  <span class="card-tag">Sheaf Notes</span>
                  <span class="card-date">{{ formattedDate }}</span>
                </header>
                <main
                  ref="cardMeasureContentRef"
                  class="card-main-content"
                  :style="{ fontSize: paginatedCardFontSize + 'px' }"
                >
                  <div class="card-measure-inner" v-html="measureCardHtml"></div>
                </main>
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
        <!-- <header class="pane-header">
          <h2 class="pane-title">版面配置</h2>
        </header> -->

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
            <p class="section-hint">小红书卡片固定为 3:4 竖图，正文会自动收放以适配卡面。</p>

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

.export-studio-overlay.is-embedded {
  position: absolute;
  inset: 0;
  z-index: 200;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.wechat-content :deep(.math-block),
.card-main-content :deep(.math-block) {
  margin: 20px 0;
  text-align: center;
  overflow: visible;
}

.wechat-content :deep(.math-block .katex-display),
.card-main-content :deep(.math-block .katex-display) {
  margin: 0;
  overflow: visible;
}

.wechat-content :deep(.mermaid),
.card-main-content :deep(.mermaid) {
  margin: 20px 0;
  overflow-x: auto;
  text-align: center;
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
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 10;
}

.capture-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  position: relative;
  z-index: 1;
}

.card-pagination-rail {
  position: relative;
  width: min(414px, calc(100% - 36px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  pointer-events: auto;
  z-index: 3;
}

.capture-box {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 28px 28px 24px;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.capture-box-measure {
  position: fixed;
  left: -99999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.card-measure-inner {
  width: 100%;
  box-sizing: border-box;
}

/* 宽高比例适配 */
.capture-box.type-xiaohongshu {
  aspect-ratio: 1242 / 1660;
  width: 414px;
  height: 553.333333px;
}

.capture-box.type-long-image {
  width: 420px;
  min-height: 480px;
}

/* 小红书非截图状态下正文溢出滚动 */
.capture-box.type-xiaohongshu .card-main-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.card-main-content.is-paginating {
  opacity: 0.18;
}

.card-loading-mask {
  position: absolute;
  inset: 72px 28px 82px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  z-index: 4;
  color: currentColor;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.54);
  backdrop-filter: blur(8px);
}

.theme-dark .card-loading-mask {
  background: rgba(16, 17, 18, 0.58);
}

.card-loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: card-loading-spin 0.72s linear infinite;
}

@keyframes card-loading-spin {
  to {
    transform: rotate(360deg);
  }
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

/* 卡片细部样式 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  flex-shrink: 0;
}

.card-tag {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 100px;
}

.card-date {
  font-size: 10px;
  font-weight: 500;
  font-family: monospace;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.card-page-count {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9px;
  letter-spacing: 0.02em;
  background: rgba(0, 0, 0, 0.06);
}

.theme-dark .card-page-count {
  background: rgba(255, 255, 255, 0.08);
}

/* 卡片排版 */
.card-main-content {
  line-height: 1.66;
  text-align: justify;
  min-height: 0;
  overflow-wrap: anywhere;
}

.card-main-content :deep(h1),
.card-main-content :deep(h2),
.card-main-content :deep(h3) {
  line-height: 1.4;
  margin: 1.05em 0 0.55em;
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
  margin: 0 0 0.72em;
}

.card-main-content :deep(hr) {
  height: 1px;
  margin: 0.8em 0 1em;
  border: 0;
  background: linear-gradient(90deg, transparent, rgba(46, 42, 36, 0.12), transparent);
}

.theme-dark .card-main-content :deep(hr) {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
}

.card-main-content :deep(.card-measure-inner > :last-child) {
  margin-bottom: 0;
}

.card-main-content :deep(blockquote) {
  margin: 0 0 0.8em;
  padding-left: 12px;
  border-left: 3px solid currentColor;
  opacity: 0.8;
  font-style: italic;
}

.card-main-content :deep(ul),
.card-main-content :deep(ol) {
  margin: 0 0 0.8em;
  padding-left: 20px;
}

.card-main-content :deep(li) {
  margin-bottom: 0.28em;
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
  margin: 0 0 1em;
}

.theme-dark .card-main-content :deep(pre) {
  background: rgba(255, 255, 255, 0.05);
}

.card-main-content :deep(pre code) {
  background: none;
  padding: 0;
}

.card-main-content :deep(table) {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0 0 0.9em;
  overflow: hidden;
  border: 1px solid rgba(46, 42, 36, 0.16);
  border-radius: 6px;
  font-size: 0.86em;
  line-height: 1.45;
  text-align: left;
}

.theme-dark .card-main-content :deep(table) {
  border-color: rgba(255, 255, 255, 0.16);
}

.card-main-content :deep(th),
.card-main-content :deep(td) {
  padding: 6px 7px;
  vertical-align: top;
  border-right: 1px solid rgba(46, 42, 36, 0.12);
  border-bottom: 1px solid rgba(46, 42, 36, 0.12);
  overflow-wrap: break-word;
  word-break: normal;
}

.theme-dark .card-main-content :deep(th),
.theme-dark .card-main-content :deep(td) {
  border-color: rgba(255, 255, 255, 0.13);
}

.card-main-content :deep(th) {
  font-weight: 700;
  background: rgba(46, 42, 36, 0.06);
}

.theme-dark .card-main-content :deep(th) {
  background: rgba(255, 255, 255, 0.08);
}

.card-main-content :deep(tr > :last-child) {
  border-right: 0;
}

.card-main-content :deep(tbody tr:last-child > td) {
  border-bottom: 0;
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
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(46, 42, 36, 0.035);
  flex-shrink: 0;
}

.theme-dark .card-footer {
  border-top-color: rgba(255, 255, 255, 0.06);
}

.card-pagination {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
}

.card-pagination-btn {
  min-width: 84px;
  padding: 8px 12px;
  border: 1px solid var(--ink-border);
  background: var(--ink-surface);
  color: var(--ink-text);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, background 0.15s;
  pointer-events: auto;
  box-shadow: 0 8px 20px rgba(42, 37, 32, 0.12);
}

.card-pagination-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--ink-border-strong);
}

.card-pagination-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.card-pagination-indicator {
  min-width: 92px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-text-muted);
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--ink-border);
  border-radius: 999px;
  padding: 6px 10px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 20px rgba(42, 37, 32, 0.08);
}

.export-studio-overlay.is-dark .card-pagination-indicator {
  background: rgba(31, 28, 26, 0.72);
}

.author-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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
  min-width: 0;
}

.author-name {
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author-desc {
  font-size: 9px;
  white-space: nowrap;
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
