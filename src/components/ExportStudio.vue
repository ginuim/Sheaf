<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Undo2, Eye, EyeOff } from "@lucide/vue";
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
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useExportTypography } from "../composables/useExportTypography";
import { useAppToast } from "../composables/useAppToast";
import {
  loadExportCardSettings,
  saveExportCardSettings,
} from "../lib/exportCardSettings";
import { splitLeadingH1Title } from "../lib/wechatHtml";
import { useLocale } from "../composables/useLocale";
import QRCode from "qrcode";

const { t } = useLocale();
const { showToast, dismissToast } = useAppToast();

const LONG_IMAGE_MAX_HEIGHT_PRESETS = [0, 800, 1200, 1600, 2000, 2400] as const;

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
  await message(text, { title: t("export.dialogTitle"), kind });
}

async function revealSavedImageInFolder(path: string) {
  try {
    await revealItemInDir(path);
    dismissToast();
  } catch (error) {
    console.error("Reveal saved image error:", error);
    showToast("error", t("export.openSavedImageFolderFailed"));
  }
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

const showEditor = ref(false);

const { settings: exportTypographySettings } = useExportTypography();
const savedCardSettings = loadExportCardSettings();

// 导出配置状态
const config = ref({
  type: "wechat" as "wechat" | "xiaohongshu" | "long-image",
  wechatTheme: "classic" as "classic" | "editorial" | "minimal",
  cardTheme: "classic" as "classic" | "modern" | "dark",
  author: savedCardSettings.author,
  authorDesc: savedCardSettings.authorDesc,
  longImageMaxHeight: savedCardSettings.longImageMaxHeight,
  longImageQrEnabled: savedCardSettings.longImageQrEnabled,
  longImageQrUrl: savedCardSettings.longImageQrUrl,
  longImageQrLabel: savedCardSettings.longImageQrLabel,
  fontSize: 15,
});

const longImageContentClipped = ref(false);
const longImageQrDataUrl = ref("");

const XIAOHONGSHU_EXPORT_SIZE = {
  width: 1242,
  height: 1660,
} as const;
const XIAOHONGSHU_EXPORT_PIXEL_RATIO = 3;
const XIAOHONGSHU_CAPTURE_SIZE = {
  width: XIAOHONGSHU_EXPORT_SIZE.width / XIAOHONGSHU_EXPORT_PIXEL_RATIO,
  height: XIAOHONGSHU_EXPORT_SIZE.height / XIAOHONGSHU_EXPORT_PIXEL_RATIO,
} as const;
const CARD_MEDIA_MIN_SCALE = 0.6;
const CARD_SPLIT_SNAP_MAX_BACKTRACK = 4;

const exporting = ref(false);
const exportingImage = ref(false);
const copyingWechatTitle = ref(false);
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
let measureHeightCache = new Map<string, number>();

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
const wechatCopyParts = computed(() => splitLeadingH1Title(modelValue.value));
const wechatCopyTitle = computed(() => wechatCopyParts.value.title);
const wechatCopyBody = computed(() => wechatCopyParts.value.body);

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
const longImageMaxHeightActive = computed(
  () => isLongImage.value && config.value.longImageMaxHeight > 0,
);
const longImageCaptureStyle = computed(() => {
  if (!longImageMaxHeightActive.value) return undefined;
  return {
    "--long-image-max-height": `${config.value.longImageMaxHeight}px`,
  };
});
const longImageQrLabel = computed(
  () => config.value.longImageQrLabel.trim() || t("export.qrDefaultLabel"),
);
const showLongImageQr = computed(
  () =>
    isLongImage.value &&
    config.value.longImageQrEnabled &&
    longImageQrDataUrl.value.length > 0,
);
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
  if (cardPaginationPending.value) return t("export.paginationPending");
  return `${currentCardIndex.value + 1} / ${cardPageCount.value}`;
});

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function updateLongImageClipState() {
  if (!longImageMaxHeightActive.value) {
    longImageContentClipped.value = false;
    return;
  }

  await nextTick();
  await waitForAnimationFrame();
  const main = cardContentRef.value;
  const inner = main?.querySelector(".card-measure-inner") as HTMLElement | null;
  if (!main || !inner) {
    longImageContentClipped.value = false;
    return;
  }

  longImageContentClipped.value = inner.scrollHeight > main.clientHeight + 2;
}

async function refreshLongImageQrCode() {
  if (!config.value.longImageQrEnabled) {
    longImageQrDataUrl.value = "";
    return;
  }

  const target = config.value.longImageQrUrl.trim();
  if (!target) {
    longImageQrDataUrl.value = "";
    return;
  }

  try {
    longImageQrDataUrl.value = await QRCode.toDataURL(target, {
      width: 128,
      margin: 1,
      errorCorrectionLevel: "L",
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    });
  } catch {
    longImageQrDataUrl.value = "";
  } finally {
    await updateLongImageClipState();
  }
}

function persistExportCardSettings() {
  saveExportCardSettings({
    author: config.value.author,
    authorDesc: config.value.authorDesc,
    longImageMaxHeight: config.value.longImageMaxHeight,
    longImageQrEnabled: config.value.longImageQrEnabled,
    longImageQrUrl: config.value.longImageQrUrl,
    longImageQrLabel: config.value.longImageQrLabel,
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

  return blocks;
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

function isScalableCardMediaBlock(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  const elements = Array.from(root.children) as HTMLElement[];
  if (!elements.length) return false;

  const directMedia = elements.length === 1
    ? elements[0].matches("img, svg, canvas, video, figure, .mermaid, .math-block")
    : false;
  const nestedMedia = root.querySelector("img, svg, canvas, video, figure, .mermaid, .math-block");
  if (!directMedia && !nestedMedia) return false;

  const textProbe = root.cloneNode(true) as HTMLElement;
  textProbe
    .querySelectorAll("img, svg, canvas, video, figure, .mermaid, .math-block")
    .forEach((node) => node.remove());
  return (textProbe.textContent ?? "").replace(/\s+/g, "").length <= 12;
}

function buildScaledMediaCardBlock(html: string, scale: number, height: number) {
  const safeScale = Math.min(1, Math.max(CARD_MEDIA_MIN_SCALE, scale));
  const safeHeight = Math.max(1, Math.ceil(height));
  return [
    `<div class="card-scaled-media" style="--card-media-scale: ${safeScale.toFixed(3)}; height: ${safeHeight}px;">`,
    `<div class="card-scaled-media-body">${html}</div>`,
    "</div>",
  ].join("");
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

type SplittableCardBlock = {
  element: HTMLElement;
  contentElement: HTMLElement;
  text: string;
  textStart: number;
};

function findCardTextBoundary(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode() as Text | null;

  while (node) {
    if (remaining <= node.data.length) {
      return { container: node as Node, offset: remaining };
    }
    remaining -= node.data.length;
    node = walker.nextNode() as Text | null;
  }

  return { container: root as Node, offset: root.childNodes.length };
}

function buildSplitCardBlock(
  parsed: SplittableCardBlock,
  startIndex: number,
  endIndex: number,
) {
  const start = findCardTextBoundary(
    parsed.contentElement,
    parsed.textStart + startIndex,
  );
  const end = findCardTextBoundary(
    parsed.contentElement,
    parsed.textStart + endIndex,
  );
  const range = document.createRange();
  range.setStart(start.container, start.offset);
  range.setEnd(end.container, end.offset);

  const contentClone = parsed.contentElement.cloneNode(false) as HTMLElement;
  contentClone.appendChild(range.cloneContents());

  if (parsed.contentElement === parsed.element) {
    return contentClone.outerHTML;
  }

  const blockClone = parsed.element.cloneNode(false) as HTMLElement;
  blockClone.appendChild(contentClone);
  return blockClone.outerHTML;
}

function readSplittableCardBlock(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  const elements = Array.from(root.children) as HTMLElement[];
  if (elements.length !== 1) return null;

  const element = elements[0];
  const tagName = element.tagName.toLowerCase();
  if (["table", "pre", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
    return null;
  }

  let contentElement = element;
  if (tagName === "ul" || tagName === "ol") {
    const items = Array.from(element.children).filter(
      (child): child is HTMLElement => child.tagName.toLowerCase() === "li",
    );
    if (items.length !== 1) return null;
    contentElement = items[0];
  }

  const rawText = contentElement.textContent ?? "";
  const textStart = rawText.search(/\S/);
  if (textStart < 0) return null;
  const textEnd = rawText.search(/\s*$/);
  const text = rawText.slice(textStart, textEnd);
  if (text.length < 2) return null;

  return { element, contentElement, text, textStart };
}

function snapCardSplitIndex(text: string, index: number) {
  // 只在测得的行尾附近吸附标点，避免为了完整句子回退大半行，
  // 造成当前页明明还能容纳文字却留下明显空白。
  const minIndex = Math.max(1, index - CARD_SPLIT_SNAP_MAX_BACKTRACK);
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

async function splitCardBlockToFitPage(
  currentHtml: string,
  block: string,
  targetHeight: number,
  runId: number,
) {
  const parsed = readSplittableCardBlock(block);
  if (!parsed) return null;

  let low = 1;
  let high = parsed.text.length - 1;
  let bestIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildSplitCardBlock(parsed, 0, mid);
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
  // DOM 高度按整行增长；只要能放入任意字符，二分搜索就会继续吃满
  // 当前可用的最后一行。不要再用固定字符数判断，否则列表缩进、粗体
  // 或较大字号下，一整行少于 18 个字符时会被误判为不可拆分。
  if (splitIndex <= 0 || splitIndex >= parsed.text.length) return null;

  return [
    buildSplitCardBlock(parsed, 0, splitIndex),
    buildSplitCardBlock(parsed, splitIndex, parsed.text.length),
  ];
}

function ensureMeasureSurface() {
  const signature = `${config.value.type}:${config.value.cardTheme}`;

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

async function waitForMeasureImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img")).filter(
    (image) => !image.complete || image.naturalHeight === 0,
  );
  if (!images.length) return;

  await Promise.race([
    Promise.all(
      images.map((image) => {
        const imageLoaded = new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
        return Promise.race([
          image.decode().catch(() => undefined),
          imageLoaded,
        ]);
      }),
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, 180)),
  ]);
}

async function waitForImageDecode(image: HTMLImageElement, timeoutMs: number) {
  if (image.complete && image.naturalWidth > 0) {
    await image.decode().catch(() => undefined);
    return;
  }

  await Promise.race([
    new Promise<void>((resolve) => {
      const settle = async () => {
        image.removeEventListener("load", settle);
        image.removeEventListener("error", settle);
        if (image.complete && image.naturalWidth > 0) {
          await image.decode().catch(() => undefined);
        }
        resolve();
      };
      image.addEventListener("load", settle, { once: true });
      image.addEventListener("error", settle, { once: true });
    }),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

async function waitForCaptureImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  if (!images.length) {
    await waitForAnimationFrame();
    return;
  }

  await Promise.all(images.map((image) => waitForImageDecode(image, 2500)));
  await waitForAnimationFrame();
  await waitForAnimationFrame();
}

async function inlineImagesForCapture(root: HTMLElement) {
  const restoreItems: { image: HTMLImageElement; src: string }[] = [];

  const images = Array.from(root.querySelectorAll("img"));
  console.log(`[ExportStudio] 开始内联图片，共找到 ${images.length} 张图片`);

  await Promise.all(
    images.map(async (image, index) => {
      const originalSrc = image.getAttribute("src") ?? "";
      const sheafLocalSrc = image.dataset.sheafLocalSrc;
      console.log(`[ExportStudio] 处理第 ${index + 1} 张图片:
        - 原始 src: "${originalSrc}"
        - 当前 src: "${image.src}"
        - 本地路径 (sheafLocalSrc): "${sheafLocalSrc || '无'}"`);

      if (image.src.startsWith("data:")) {
        console.log(`[ExportStudio] 第 ${index + 1} 张图片已经是 base64 格式，跳过内联`);
        return;
      }

      let base64: string | null = null;

      // 1. 尝试直接 fetch (支持本地 asset:// 协议和支持 CORS 的网络图片)
      try {
        console.log(`[ExportStudio] 第 ${index + 1} 张图片：尝试使用 fetch 获取数据...`);
        const response = await fetch(image.src);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        console.log(`[ExportStudio] 第 ${index + 1} 张图片：fetch 转换 base64 成功！长度: ${base64.length}`);
      } catch (e: any) {
        console.warn(`[ExportStudio] 第 ${index + 1} 张图片：fetch 失败，原因:`, e);
      }

      // 2. 如果 fetch 失败，且是 Tauri 环境，且有本地路径，尝试用 Tauri fs.readFile 读取
      if (!base64 && isTauri()) {
        if (sheafLocalSrc) {
          try {
            console.log(`[ExportStudio] 第 ${index + 1} 张图片：尝试使用 Tauri fs.readFile 读取本地路径 "${sheafLocalSrc}"...`);
            const bytes = await readFile(sheafLocalSrc);
            const mimeType = imageMimeTypeFromPath(sheafLocalSrc);
            base64 = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
            console.log(`[ExportStudio] 第 ${index + 1} 张图片：Tauri fs.readFile 读取成功！长度: ${base64.length}`);
          } catch (e: any) {
            console.error(`[ExportStudio] 第 ${index + 1} 张图片：Tauri fs.readFile 读取失败，原因:`, e);
          }
        } else {
          console.log(`[ExportStudio] 第 ${index + 1} 张图片：fetch 失败且没有本地路径 (sheafLocalSrc)，无法使用 fs.readFile`);
        }
      }

      // 3. 如果还是没有获取到 base64，且图片已经加载完成，尝试用 Canvas 转换
      if (!base64) {
        if (image.complete && image.naturalWidth > 0) {
          try {
            console.log(`[ExportStudio] 第 ${index + 1} 张图片：尝试使用 Canvas 转换...`);
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(image, 0, 0);
              base64 = canvas.toDataURL("image/png");
              console.log(`[ExportStudio] 第 ${index + 1} 张图片：Canvas 转换成功！长度: ${base64.length}`);
            }
          } catch (e: any) {
            console.warn(`[ExportStudio] 第 ${index + 1} 张图片：Canvas 转换失败，原因:`, e);
          }
        } else {
          console.log(`[ExportStudio] 第 ${index + 1} 张图片：图片未加载完或尺寸为 0，无法使用 Canvas 转换`);
        }
      }

      // 4. 如果成功获取到了 base64，替换 image.src 并等待解码
      if (base64) {
        image.src = base64;
        restoreItems.push({ image, src: originalSrc });
        console.log(`[ExportStudio] 第 ${index + 1} 张图片：成功替换为 base64，开始等待解码...`);
        await waitForImageDecode(image, 2500);
        console.log(`[ExportStudio] 第 ${index + 1} 张图片：解码完成！`);
      } else {
        console.error(`[ExportStudio] 第 ${index + 1} 张图片：所有内联转换手段均告失败！图片在导出中可能会显示为空白。`);
      }
    }),
  );

  console.log(`[ExportStudio] 图片内联处理完毕，已替换 ${restoreItems.length} 张图片`);

  return () => {
    console.log(`[ExportStudio] 恢复 ${restoreItems.length} 张图片的原始 src 路径`);
    for (const item of restoreItems) {
      item.image.setAttribute("src", item.src);
    }
  };
}

async function measureContentHeight(html: string, runId: number) {
  const cachedHeight = measureHeightCache.get(html);
  if (cachedHeight !== undefined) return cachedHeight;

  const contentEl = ensureMeasureSurface();
  contentEl.innerHTML = `<div class="card-measure-inner">${html}</div>`;
  const measureTarget =
    (contentEl.firstElementChild as HTMLElement | null) ?? contentEl;
  await waitForMeasureImages(measureTarget);
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
  const height = Math.ceil(measuredHeight);
  measureHeightCache.set(html, height);
  return height;
}

async function buildScaledMediaBlockToFit(
  currentHtml: string,
  block: string,
  targetHeight: number,
  runId: number,
) {
  if (targetHeight <= 0 || !isScalableCardMediaBlock(block)) return null;

  const blockHeight = await measureContentHeight(block, runId);
  if (runId !== paginationRunId || blockHeight <= 0) return null;

  let low = CARD_MEDIA_MIN_SCALE;
  let high = 1;
  let bestBlock: string | null = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const scale = (low + high) / 2;
    const scaledBlock = buildScaledMediaCardBlock(block, scale, blockHeight * scale);
    const candidateHeight = await measureContentHeight(
      currentHtml + scaledBlock,
      runId,
    );
    if (runId !== paginationRunId) return null;

    if (candidateHeight <= targetHeight) {
      bestBlock = scaledBlock;
      low = scale;
    } else {
      high = scale;
    }
  }

  return bestBlock;
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
  // 测量面与最终卡片共用同一套尺寸和样式，直接使用完整正文高度。
  // 额外扣减固定缓冲会让本可容纳的最后一行被错误推到下一页。
  const targetHeight = Math.max(1, Math.floor(availableHeight));
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
      const scaledBlock = await buildScaledMediaBlockToFit(
        currentRenderedHtml || currentBlocks.join(""),
        block,
        targetHeight,
        runId,
      );
      if (runId !== paginationRunId) return null;
      if (scaledBlock) {
        const scaledHtml = currentRenderedHtml + scaledBlock;
        const scaledHeight = await measureContentHeight(scaledHtml, runId);
        if (runId !== paginationRunId) return null;
        if (scaledHeight <= targetHeight) {
          currentBlocks = [...currentBlocks, scaledBlock];
          currentRenderedHtml = scaledHtml;
          continue;
        }
      }

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

    const scaledBlock = await buildScaledMediaBlockToFit("", block, hardHeight, runId);
    if (runId !== paginationRunId) return null;
    if (scaledBlock) {
      pages.push(scaledBlock);
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
  measureHeightCache = new Map<string, number>();

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

  const fontSize = Math.min(Math.max(Math.round(config.value.fontSize), 11), 24);

  try {
    const result = await paginateXiaohongshuCards(renderedHtml.value, fontSize, runId);
    if (!result || runId !== paginationRunId) return;

    cardPages.value = result.pages.length ? result.pages : [renderedHtml.value];
    currentCardIndex.value = 0;
    paginatedCardFontSize.value = result.fontSize;
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
  if (isLongImage.value) {
    await updateLongImageClipState();
  }
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
  void refreshLongImageQrCode();
  void updateLongImageClipState();
});

onBeforeUnmount(() => {
  if (measureHostEl?.parentElement) {
    measureHostEl.parentElement.removeChild(measureHostEl);
  }
  measureHostEl = null;
  measureSurfaceEl = null;
  measureHeightCache.clear();
});

watch(
  [
    renderedHtml,
    () => config.value.type,
    () => config.value.fontSize,
    () => props.isDark,
  ],
  () => {
    void syncPreviewLayout();
  },
);

watch(wechatPreviewHtml, () => {
  if (config.value.type === "wechat") {
    void renderVisibleMermaid();
  }
});

watch(
  () => config.value.cardTheme,
  () => {
    if (config.value.type === "long-image") {
      void renderVisibleMermaid();
    }
  },
);

watch(
  () =>
    [
      config.value.author,
      config.value.authorDesc,
      config.value.longImageMaxHeight,
      config.value.longImageQrEnabled,
      config.value.longImageQrUrl,
      config.value.longImageQrLabel,
    ] as const,
  () => {
    persistExportCardSettings();
  },
);

watch(
  [
    renderedHtml,
    () => config.value.longImageMaxHeight,
    () => config.value.fontSize,
    () => config.value.type,
    () => config.value.cardTheme,
  ],
  () => {
    if (isLongImage.value) {
      void updateLongImageClipState();
    }
  },
);

watch(
  [
    () => config.value.longImageQrEnabled,
    () => config.value.longImageQrUrl,
    showLongImageQr,
  ],
  () => {
    void refreshLongImageQrCode();
    if (isLongImage.value) {
      void updateLongImageClipState();
    }
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function imageMimeTypeFromPath(path: string) {
  const extension = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    default:
      return "image/png";
  }
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

async function toPngWithRetry(el: HTMLElement, options: any, maxAttempts = 3): Promise<string> {
  let previousLength = 0;
  let dataUrl = "";
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    dataUrl = await toPng(el, options);
    console.log(`[ExportStudio] toPng 尝试第 ${attempt} 次, dataUrl 长度: ${dataUrl.length}`);
    
    // 如果长度没有变化，或者已经达到最大尝试次数，就直接返回
    if (dataUrl.length === previousLength) {
      console.log(`[ExportStudio] dataUrl 长度稳定在 ${dataUrl.length}，停止尝试`);
      break;
    }
    
    previousLength = dataUrl.length;
    
    // 稍微等待一个 animation frame，给 WebKit 渲染的时间
    await waitForAnimationFrame();
  }
  
  return dataUrl;
}

async function captureExportImage(el: HTMLElement) {
  const restoreLocalImages = await inlineImagesForCapture(el);
  try {
    await waitForCaptureImages(el);
    await waitForAnimationFrame();
    const isXiaohongshu = config.value.type === "xiaohongshu";
    const isLongImageExport = config.value.type === "long-image";
    const captureWidth = isXiaohongshu
      ? XIAOHONGSHU_CAPTURE_SIZE.width
      : el.offsetWidth;
    const captureHeight = isXiaohongshu
      ? XIAOHONGSHU_CAPTURE_SIZE.height
      : el.offsetHeight;

    const themeBackgroundColors: Record<string, string> = {
      classic: "#fbf9f4",
      modern: "#eff0f1",
      dark: "#17191a",
    };

    const baseOptions = {
      cacheBust: false,
      pixelRatio: isXiaohongshu ? XIAOHONGSHU_EXPORT_PIXEL_RATIO : 2,
      backgroundColor: themeBackgroundColors[config.value.cardTheme] || "#ffffff",
      skipFonts: true,
    } as const;

    if (isLongImageExport) {
      const capped = config.value.longImageMaxHeight > 0;
      const exportHeight = capped ? el.offsetHeight : undefined;
      return await toPngWithRetry(el, {
        ...baseOptions,
        width: captureWidth,
        height: exportHeight,
        canvasWidth: exportHeight ? captureWidth : undefined,
        canvasHeight: exportHeight,
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
          width: `${captureWidth}px`,
          height: capped ? `${exportHeight}px` : "auto",
          overflow: "hidden",
        },
      });
    }

    return await toPngWithRetry(el, {
      ...baseOptions,
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
  } finally {
    restoreLocalImages();
  }
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
        t("export.wechatCopied"),
      );
    } else {
      await studioMessage(result.message, "error");
    }
  } finally {
    exporting.value = false;
  }
}

async function handleCopyWechatTitle() {
  if (exporting.value || copyingWechatTitle.value || !wechatCopyTitle.value) return;
  copyingWechatTitle.value = true;
  try {
    const result = await copyPlainText(wechatCopyTitle.value);
    if (result.ok) {
      await studioMessage(t("export.titleCopied"));
    } else {
      await studioMessage(result.message, "error");
    }
  } finally {
    copyingWechatTitle.value = false;
  }
}

// 复制纯文本
async function handleCopyPlain() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const text =
      config.value.type === "wechat" && wechatCopyTitle.value
        ? wechatCopyBody.value
        : modelValue.value;
    const result = await copyPlainText(text);
    if (result.ok) {
      await studioMessage(t("export.markdownCopied"));
    } else {
      await studioMessage(result.message, "error");
    }
  } finally {
    exporting.value = false;
  }
}

// 导出为图片（支持长图与分享卡片）
async function handleDownloadImage() {
  if (exportingImage.value) return;
  const el = exportCaptureRef.value;
  if (!el) {
    await studioMessage(t("export.previewNotFound"), "error");
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
        title: t("export.saveImageTitle"),
        defaultPath: imageJobs[0]?.fileName ?? cardImageFileName(0, pageCount),
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!selectedPath) return;
      const selectedParts = splitPathExtension(selectedPath);
      const selectedBase =
        imageJobs.length > 1
          ? selectedParts.base.replace(/-card-\d+$/i, "")
          : selectedParts.base;
      const savedPaths: string[] = [];
      for (let index = 0; index < imageJobs.length; index++) {
        const targetPath =
          imageJobs.length === 1
            ? selectedPath
            : `${selectedBase}-card-${String(index + 1).padStart(2, "0")}${selectedParts.extension || ".png"}`;
        await writeFile(targetPath, dataUrlToBytes(imageJobs[index].dataUrl));
        savedPaths.push(targetPath);
      }
      showToast(
        "success",
        imageJobs.length > 1
          ? t("export.imageSavedMultiple", { count: imageJobs.length })
          : t("export.imageSaved"),
        0,
        savedPaths[0]
          ? {
              label: t("export.openSavedImageFolder"),
              onClick: () => revealSavedImageInFolder(savedPaths[0]),
            }
          : undefined,
      );
    } else {
      for (const image of imageJobs) {
        downloadDataUrl(image.dataUrl, image.fileName);
      }
    }
  } catch (error: any) {
    console.error("Export image error:", error);
    await studioMessage(error?.message || t("export.imageExportFailed"), "error");
  } finally {
    currentCardIndex.value = originalCardIndex;
    await nextTick();
    el.scrollTop = originalScrollTop;
    exportingImage.value = false;
  }
}

const cardThemes = computed(() => [
  { id: "classic" as const, label: t("export.themes.classic"), desc: t("export.themes.classicDesc") },
  { id: "modern" as const, label: t("export.themes.modern"), desc: t("export.themes.modernDesc") },
  { id: "dark" as const, label: t("export.themes.dark"), desc: t("export.themes.darkDesc") },
]);

const wechatThemes = computed(() =>
  WECHAT_THEMES.map((theme) => ({
    ...theme,
    label: t(`export.wechatThemes.${theme.id}`),
    description: t(`export.wechatThemes.${theme.id}Desc`),
  })),
);

const displayAuthorName = computed(() => config.value.author || t("export.defaultAuthorName"));
const displayAuthorDesc = computed(() => config.value.authorDesc || t("export.defaultAuthorDesc"));
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
        <span class="studio-title">{{ t("export.title") }}</span>
      </div>
      <div class="header-right">
        <button
          class="toggle-editor-btn"
          :class="{ active: showEditor }"
          :title="showEditor ? t('export.hideEditor') : t('export.showEditor')"
          @click="showEditor = !showEditor"
        >
          <EyeOff v-if="showEditor" :size="14" aria-hidden="true" />
          <Eye v-else :size="14" aria-hidden="true" />
          <span>{{ showEditor ? t("export.hideEditor") : t("export.showEditor") }}</span>
        </button>
        <button class="exit-btn" :title="t('export.backToEditTitle')" @click="emit('close')">
          <Undo2 :size="14" aria-hidden="true" />
          <span>{{ t("export.backToEdit") }}</span>
        </button>
      </div>
    </header>

    <!-- 工作台主体 -->
    <div class="studio-body">
      <!-- 左栏：Markdown 事实源 -->
      <section v-show="showEditor" class="studio-pane pane-editor-source">
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
                <span class="wechat-preview-title">{{ t("export.wechatPreviewTitle") }}</span>
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

            <!-- 分享卡片或长图大预览（包含真实的渲染与截图定位容器） -->
            <div v-else class="preview-image-wrapper">
              <div class="capture-stack">
                <div
                  ref="exportCaptureRef"
                  class="capture-box"
                  :class="[
                    `theme-${config.cardTheme}`,
                    `type-${config.type}`,
                    { 'has-max-height': longImageMaxHeightActive },
                  ]"
                  :style="longImageCaptureStyle"
                >
                  <!-- 装饰背景 -->
                  <div class="card-deco-mesh"></div>

                  <!-- 顶部卡片元信息 -->
                  <header class="card-header">
                    <span class="card-tag">Sheaf Notes</span>
                    <span class="card-date">
                      {{ formattedDate }}
                      <span v-if="isXiaohongshuCard" class="card-page-count">
                        {{ cardPaginationPending ? t("export.paginationCalculating") : `${currentCardIndex + 1}/${cardPageCount}` }}
                      </span>
                    </span>
                  </header>

                  <!-- 正文区域 -->
                  <main
                    ref="cardContentRef"
                    class="card-main-content"
                    :class="{
                      'is-paginating': cardPaginationPending,
                      'has-height-cap': longImageMaxHeightActive,
                    }"
                    :style="{ fontSize: paginatedCardFontSize + 'px' }"
                  >
                    <div class="card-measure-inner" v-html="currentCardHtml"></div>
                    <div
                      v-if="longImageContentClipped"
                      class="card-content-fade"
                      aria-hidden="true"
                    />
                  </main>

                  <div v-if="cardPaginationPending" class="card-loading-mask">
                    <span class="card-loading-spinner" aria-hidden="true"></span>
                    <span>{{ t("export.paginationLoading") }}</span>
                  </div>

                  <!-- 底部作者栏 -->
                  <footer class="card-footer" :class="{ 'has-qr': showLongImageQr }">
                    <div class="author-info">
                      <div class="author-avatar">{{ authorInitial }}</div>
                      <div class="author-meta">
                        <span class="author-name">{{ displayAuthorName }}</span>
                        <span class="author-desc">{{ displayAuthorDesc }}</span>
                      </div>
                    </div>
                    <div v-if="showLongImageQr" class="card-qr-block">
                      <img
                        :src="longImageQrDataUrl"
                        alt=""
                        class="card-qr-image"
                      />
                      <span class="card-qr-label">{{ longImageQrLabel }}</span>
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
                  {{ t("export.previousCard") }}
                </button>
                <span class="card-pagination-indicator">
                  {{ cardPaginationText }}
                </span>
                <button
                  class="card-pagination-btn"
                  :disabled="cardPaginationPending || currentCardIndex >= cardPageCount - 1"
                  @click="goToNextCard"
                >
                  {{ t("export.nextCard") }}
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
                      <span class="author-name">{{ displayAuthorName }}</span>
                      <span class="author-desc">{{ displayAuthorDesc }}</span>
                    </div>
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
            <h3 class="section-label">{{ t("export.destination") }}</h3>
            <div class="type-switch">
              <button
                class="type-btn"
                :class="{ active: config.type === 'wechat' }"
                @click="config.type = 'wechat'"
              >
                {{ t("export.typeWechat") }}
              </button>
              <button
                class="type-btn"
                :class="{ active: config.type === 'xiaohongshu' }"
                @click="config.type = 'xiaohongshu'"
              >
                {{ t("export.typeXiaohongshu") }}
              </button>
              <button
                class="type-btn"
                :class="{ active: config.type === 'long-image' }"
                @click="config.type = 'long-image'"
              >
                {{ t("export.typeLongImage") }}
              </button>
            </div>
          </section>

          <!-- 2. 微信排版主题 -->
          <section v-if="config.type === 'wechat'" class="control-section">
            <h3 class="section-label">{{ t("export.wechatStyle") }}</h3>
            <p class="section-hint">{{ t("export.wechatStyleHint") }}</p>

            <div class="theme-list">
              <button
                v-for="theme in wechatThemes"
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

          <!-- 3. 长图配置 -->
          <section v-if="config.type === 'long-image'" class="control-section">
            <h3 class="section-label">{{ t("export.longImageSettings") }}</h3>
            <p class="section-hint">{{ t("export.longImageSettingsHint") }}</p>

            <div class="form-group">
              <label class="form-label">{{ t("export.cardVisualStyle") }}</label>
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

            <div class="form-group">
              <label class="form-label">{{ t("export.longImageMaxHeight") }}</label>
              <div class="height-preset-row">
                <button
                  v-for="height in LONG_IMAGE_MAX_HEIGHT_PRESETS"
                  :key="height"
                  class="height-preset-btn"
                  :class="{ active: config.longImageMaxHeight === height }"
                  @click="config.longImageMaxHeight = height"
                >
                  {{
                    height === 0
                      ? t("export.longImageMaxHeightUnlimited")
                      : `${height}px`
                  }}
                </button>
              </div>
            </div>

            <div class="form-group inline-group">
              <label class="form-label">{{ t("export.longImageQrEnabled") }}</label>
              <input
                v-model="config.longImageQrEnabled"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <template v-if="config.longImageQrEnabled">
              <div class="form-group">
                <label class="form-label">{{ t("export.longImageQrUrl") }}</label>
                <input
                  v-model="config.longImageQrUrl"
                  type="url"
                  class="form-input"
                  :placeholder="t('export.longImageQrUrlPlaceholder')"
                />
              </div>
              <div class="form-group">
                <label class="form-label">{{ t("export.longImageQrLabel") }}</label>
                <input
                  v-model="config.longImageQrLabel"
                  type="text"
                  class="form-input"
                  :placeholder="t('export.qrDefaultLabel')"
                />
              </div>
            </template>
          </section>

          <!-- 4. 分享卡片配置 -->
          <section v-if="config.type === 'xiaohongshu'" class="control-section">
            <h3 class="section-label">{{ t("export.cardSettings") }}</h3>
            <p class="section-hint">{{ t("export.cardSettingsHint") }}</p>

            <div class="form-group">
              <label class="form-label">{{ t("export.cardVisualStyle") }}</label>
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

          <!-- 5. 署名（非微信端适用） -->
          <section v-if="config.type !== 'wechat'" class="control-section">
            <h3 class="section-label">{{ t("export.byline") }}</h3>

            <div class="form-group">
              <label class="form-label">{{ t("export.authorName") }}</label>
              <input
                v-model="config.author"
                type="text"
                class="form-input"
                :placeholder="t('export.authorNamePlaceholder')"
              />
            </div>

            <div class="form-group">
              <label class="form-label">{{ t("export.authorDesc") }}</label>
              <input
                v-model="config.authorDesc"
                type="text"
                class="form-input"
                :placeholder="t('export.authorDescPlaceholder')"
              />
            </div>
          </section>

          <!-- 6. 统一字号调节 -->
          <section class="control-section">
            <h3 class="section-label">{{ t("export.fontSize") }}</h3>
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
          <div v-if="config.type === 'wechat'" class="wechat-title-copy">
            <div class="wechat-title-copy-meta">
              <span class="wechat-title-copy-label">{{ t("export.wechatTitleLabel") }}</span>
              <span class="wechat-title-copy-value">
                {{ wechatCopyTitle || t("export.noH1Title") }}
              </span>
            </div>
            <button
              class="btn-ghost title-copy-btn"
              :disabled="exporting || copyingWechatTitle || !wechatCopyTitle"
              @click="handleCopyWechatTitle"
            >
              {{ copyingWechatTitle ? t("export.copyingTitle") : t("export.copyTitle") }}
            </button>
          </div>
          <button
            v-if="config.type === 'wechat'"
            class="btn-primary"
            :disabled="exporting"
            @click="handleCopyWechatHtml"
          >
            {{ exporting ? t("export.copyingHtml") : t("export.copyInlineHtml") }}
          </button>
          <button
            v-else
            class="btn-primary"
            :disabled="exportingImage"
            @click="handleDownloadImage"
          >
            {{ exportingImage ? t("export.generatingImage") : t("export.saveHdImage") }}
          </button>
          <button
            class="btn-ghost"
            :disabled="exporting || exportingImage"
            @click="handleCopyPlain"
          >
            {{ t("export.copyPlainText") }}
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

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-editor-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--ink-border);
  color: var(--ink-text-muted);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-editor-btn:hover {
  color: var(--ink-text);
  background: var(--ink-inset-hover);
  border-color: var(--ink-border-strong);
}

.toggle-editor-btn.active {
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  border-color: var(--ink-accent);
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

@media (max-width: 960px) {
  .pane-editor-source {
    display: none;
  }
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
  min-width: 0; /* 允许在空间不足时收缩，防止挤压右侧控制栏 */
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
  overflow: auto; /* 允许水平和垂直滚动 */
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  box-sizing: border-box;
}

.canvas-viewport.type-long-image .canvas-scroller {
  align-items: flex-start;
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

/* 分享卡片 / 长图大预览容器 */
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

.canvas-viewport.type-long-image .preview-image-wrapper {
  height: auto;
  min-height: min-content;
  justify-content: flex-start;
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
  overflow: hidden;
}

.capture-box.type-long-image.has-max-height {
  max-height: var(--long-image-max-height);
}

.capture-box.type-long-image.has-max-height .card-main-content.has-height-cap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.card-content-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 108px;
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--card-fade-color) 78%
  );
}

/* 分享卡片非截图状态下正文溢出滚动 */
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
  --card-fade-color: #fbf9f4;
  --card-link-color: #3d5a4c;
  --card-link-underline: rgba(61, 90, 76, 0.28);
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

/* 2. 现代冷灰主题 */
.theme-modern {
  --card-fade-color: #eff0f1;
  --card-link-color: #3f5f70;
  --card-link-underline: rgba(63, 95, 112, 0.26);
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

/* 3. 暗黑极简 */
.theme-dark {
  --card-fade-color: #17191a;
  --card-link-color: #b8c8bd;
  --card-link-underline: rgba(184, 200, 189, 0.34);
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

.card-main-content :deep(a) {
  color: var(--card-link-color, currentColor);
  text-decoration-color: var(--card-link-underline, currentColor);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
  word-break: break-word;
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

.card-main-content :deep(.card-measure-inner > :first-child) {
  margin-top: 0;
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

.card-main-content :deep(.card-scaled-media) {
  width: 100%;
  overflow: hidden;
}

.card-main-content :deep(.card-scaled-media-body) {
  width: 100%;
  transform: scale(var(--card-media-scale, 1));
  transform-origin: top center;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(46, 42, 36, 0.035);
  flex-shrink: 0;
}

.card-footer.has-qr {
  align-items: flex-end;
}

.card-qr-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-qr-image {
  width: 54px;
  height: 54px;
  border-radius: 6px;
  background: #ffffff;
  padding: 3px;
  box-sizing: border-box;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.theme-dark .card-qr-image {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
}

.card-qr-label {
  max-width: 72px;
  font-size: 8px;
  line-height: 1.35;
  text-align: center;
  color: inherit;
  opacity: 0.72;
  word-break: break-all;
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
  flex: 1;
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
  flex: 1;
}

.author-name {
  font-size: 11px;
  font-weight: 600;
}

.author-desc {
  font-size: 9px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 28px;
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

.height-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.height-preset-btn {
  padding: 6px 10px;
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: var(--ink-bg);
  color: var(--ink-text-muted);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.height-preset-btn:hover {
  border-color: var(--ink-border-strong);
  color: var(--ink-text);
}

.height-preset-btn.active {
  border-color: var(--ink-accent);
  background: var(--ink-accent-soft);
  color: var(--ink-text);
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

.wechat-title-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
}

.wechat-title-copy-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wechat-title-copy-label {
  font-size: 10px;
  color: var(--ink-text-muted);
}

.wechat-title-copy-value {
  overflow: hidden;
  color: var(--ink-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-copy-btn {
  width: auto;
  padding: 7px 10px;
  border: 1px solid var(--ink-border);
  background: var(--ink-surface);
  white-space: nowrap;
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
