<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { renderMermaidIn } from "../composables/useMermaid";
import { renderMarkdown } from "../composables/useMarkdown";
import { resolveMediaSrc } from "../composables/resolveMediaSrc";
import { useExportTypography } from "../composables/useExportTypography";
import {
  applySearchHits,
  clearSearchHits,
  setActiveSearchHit,
} from "../lib/domTextSearch";
import type { PreviewAiMarks } from "../composables/useAI";

export type PreviewImageCropPayload = {
  previewSrc: string;
  markdownSrc: string;
  localPath: string | null;
  sourceLine: number;
};

const props = withDefaults(
  defineProps<{
    source: string;
    docFilePath?: string | null;
    mediaEpoch?: number;
    searchOpen?: boolean;
    searchText?: string;
    searchCaseSensitive?: boolean;
    aiMarks?: PreviewAiMarks | null;
    aiAddedLabel?: string;
    aiRemovedLabel?: string;
  }>(),
  {
    searchOpen: false,
    searchText: "",
    searchCaseSensitive: false,
    aiMarks: null,
    aiAddedLabel: "",
    aiRemovedLabel: "",
  },
);

const emit = defineEmits<{
  "open-link": [href: string];
  "layout-change": [];
  "crop-image": [payload: PreviewImageCropPayload];
  "search-stats": [stats: { current: number; total: number }];
}>();

const articleRef = ref<HTMLElement | null>(null);
const { settings: exportTypographySettings } = useExportTypography();
let layoutFrame = 0;
let searchGroups: HTMLElement[][] = [];
const searchActiveIndex = ref(0);

const AI_CHANGED_CLASS = "preview-ai-changed";
const AI_REMOVED_CLASS = "preview-ai-removed";

const hasAiMarks = computed(() => {
  const marks = props.aiMarks;
  return Boolean(marks && (marks.addedLines.length > 0 || marks.removedHunks.length > 0));
});
const hasRemovedMarks = computed(() => (props.aiMarks?.removedHunks.length ?? 0) > 0);

function getPreviewContentRoot() {
  return articleRef.value?.querySelector<HTMLElement>(".preview-content") ?? null;
}

function emitSearchStats(current: number, total: number) {
  emit("search-stats", { current, total });
}

function revealSearchMatch(index: number) {
  if (searchGroups.length === 0) {
    searchActiveIndex.value = 0;
    emitSearchStats(0, 0);
    return;
  }

  const nextIndex = ((index % searchGroups.length) + searchGroups.length) % searchGroups.length;
  searchActiveIndex.value = nextIndex;
  setActiveSearchHit(searchGroups, nextIndex);
  searchGroups[nextIndex]![0]?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
  emitSearchStats(nextIndex + 1, searchGroups.length);
}

function applyPreviewSearch(scrollToActive: boolean) {
  const root = getPreviewContentRoot();
  if (!root) {
    searchGroups = [];
    searchActiveIndex.value = 0;
    emitSearchStats(0, 0);
    return;
  }

  if (!props.searchOpen || !props.searchText) {
    clearSearchHits(root);
    searchGroups = [];
    searchActiveIndex.value = 0;
    emitSearchStats(0, 0);
    return;
  }

  searchGroups = applySearchHits(root, props.searchText, props.searchCaseSensitive);
  if (searchGroups.length === 0) {
    searchActiveIndex.value = 0;
    emitSearchStats(0, 0);
    return;
  }

  const nextIndex = Math.min(searchActiveIndex.value, searchGroups.length - 1);
  if (scrollToActive) revealSearchMatch(nextIndex);
  else {
    searchActiveIndex.value = nextIndex;
    setActiveSearchHit(searchGroups, nextIndex);
    emitSearchStats(nextIndex + 1, searchGroups.length);
  }
}

function findNextSearchMatch() {
  if (searchGroups.length === 0) {
    applyPreviewSearch(true);
    return;
  }
  revealSearchMatch(searchActiveIndex.value + 1);
}

function findPreviousSearchMatch() {
  if (searchGroups.length === 0) {
    applyPreviewSearch(true);
    return;
  }
  revealSearchMatch(searchActiveIndex.value - 1);
}

type ScrollAnchor = {
  line: number;
  lineEnd: number;
  offsetRatio: number;
  absoluteRatio: number;
};
const html = computed(() =>
  renderMarkdown(props.source, props.docFilePath ?? null, {
    chineseEnglishSpacing: exportTypographySettings.chineseEnglishSpacing,
    resolveMedia: (docFilePath, src) => {
      const url = resolveMediaSrc(docFilePath, src);
      if (!props.mediaEpoch) return url;
      const joiner = url.includes("?") ? "&" : "?";
      return `${url}${joiner}v=${props.mediaEpoch}`;
    },
  }),
);

async function renderDynamicBlocks() {
  await nextTick();
  if (articleRef.value) await renderMermaidIn(articleRef.value);
  applyAiChangeMarks();
  applyPreviewSearch(false);
  scheduleLayoutChange();
}

onMounted(() => {
  void renderDynamicBlocks();
});

onUnmounted(() => {
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
});

watch(html, () => {
  void renderDynamicBlocks();
});

watch(
  () => [props.searchOpen, props.searchText, props.searchCaseSensitive] as const,
  () => {
    searchActiveIndex.value = 0;
    applyPreviewSearch(true);
  },
);

watch(
  () => props.aiMarks,
  () => {
    void nextTick().then(() => {
      applyAiChangeMarks();
      scheduleLayoutChange();
    });
  },
);

function clearAiChangeMarks(root: HTMLElement) {
  root.querySelectorAll(`.${AI_CHANGED_CLASS}`).forEach((el) => {
    el.classList.remove(AI_CHANGED_CLASS);
  });
  root.querySelectorAll(`.${AI_REMOVED_CLASS}`).forEach((el) => {
    el.remove();
  });
}

const PREVIEW_MARK_SKIP_TAGS = new Set([
  "A",
  "BR",
  "CODE",
  "EM",
  "IMG",
  "MARK",
  "SPAN",
  "STRONG",
  "SVG",
]);

type PreviewSourceBlock = { element: HTMLElement; line: number; lineEnd: number };

function isFenceCode(el: HTMLElement) {
  return el.tagName === "CODE" && el.parentElement?.tagName === "PRE";
}

function isPreviewMarkTarget(el: HTMLElement) {
  if (isFenceCode(el)) return true;
  return !PREVIEW_MARK_SKIP_TAGS.has(el.tagName);
}

function markHost(el: HTMLElement) {
  if (isFenceCode(el) && el.parentElement) return el.parentElement;
  return el;
}

function blockStartsInAdded(block: PreviewSourceBlock, added: Set<number>) {
  if (isFenceCode(block.element) || block.element.tagName === "PRE") {
    for (let line = block.line; line <= block.lineEnd; line++) {
      if (added.has(line)) return true;
    }
    return false;
  }
  return added.has(block.line);
}

function findStartBlock(blocks: PreviewSourceBlock[], startLine: number) {
  const containing = blocks.filter(
    (block) => block.line <= startLine && startLine <= block.lineEnd,
  );
  if (containing.length > 0) {
    containing.sort((left, right) => {
      const spanDiff = left.lineEnd - left.line - (right.lineEnd - right.line);
      if (spanDiff !== 0) return spanDiff;
      if (left.element.contains(right.element)) return 1;
      if (right.element.contains(left.element)) return -1;
      return 0;
    });
    return containing[0] ?? null;
  }
  return blocks.find((block) => block.line >= startLine) ?? null;
}

function applyAiChangeMarks() {
  const root = getPreviewContentRoot();
  if (!root) return;

  clearAiChangeMarks(root);
  const marks = props.aiMarks;
  if (!marks) return;

  const added = new Set<number>(marks.addedLines);
  const blocks = getSourceBlocks().filter((block) => isPreviewMarkTarget(block.element));
  const marked: HTMLElement[] = [];

  for (const block of blocks) {
    // 普通块只看起始行，避免 li/p 的 source-line-end 吃到后面的新增。
    // fence 的 data-source-line 在内层 code 上，且 ``` 行可能没变，所以按区间命中后标到外层 pre。
    if (!blockStartsInAdded(block, added)) continue;
    const host = markHost(block.element);
    if (marked.includes(host)) continue;
    host.classList.add(AI_CHANGED_CLASS);
    marked.push(host);
  }

  for (const el of marked) {
    if (el.querySelector(`.${AI_CHANGED_CLASS}`)) {
      el.classList.remove(AI_CHANGED_CLASS);
    }
  }

  for (const hunk of marks.removedHunks) {
    const marker = document.createElement("aside");
    marker.className = AI_REMOVED_CLASS;

    const label = document.createElement("div");
    label.className = "preview-ai-removed-label";
    label.textContent = props.aiRemovedLabel;

    const body = document.createElement("div");
    body.className = "preview-ai-removed-body";
    body.textContent = hunk.preview;

    marker.append(label, body);

    const next =
      findStartBlock(blocks, hunk.beforeNewLine) ??
      blocks.find((block) => block.line >= hunk.beforeNewLine);
    if (next) next.element.before(marker);
    else root.append(marker);
  }
}

function getSourceBlocks() {
  const article = articleRef.value;
  if (!article) return [];

  return Array.from(article.querySelectorAll<HTMLElement>("[data-source-line]"))
    .map((element) => {
      const line = Number(element.dataset.sourceLine);
      const lineEnd = Number(element.dataset.sourceLineEnd ?? element.dataset.sourceLine);
      return Number.isFinite(line)
        ? {
            element,
            line,
            lineEnd: Number.isFinite(lineEnd) ? lineEnd : line,
          }
        : null;
    })
    .filter(
      (item): item is { element: HTMLElement; line: number; lineEnd: number } =>
        item !== null,
    )
    .sort((left, right) => left.line - right.line);
}

function getElementTopInPane(element: HTMLElement, pane: HTMLElement) {
  return (
    element.getBoundingClientRect().top -
    pane.getBoundingClientRect().top +
    pane.scrollTop
  );
}

function getScrollAnchor(pane: HTMLElement, topInset = 0): ScrollAnchor | null {
  const blocks = getSourceBlocks();
  if (!blocks.length) return null;

  const max = pane.scrollHeight - pane.clientHeight;
  const viewportTop = pane.scrollTop + Math.max(topInset, 0) + 1;
  let active = blocks[0]!;

  for (const block of blocks) {
    if (getElementTopInPane(block.element, pane) <= viewportTop) {
      active = block;
      continue;
    }
    break;
  }

  const top = getElementTopInPane(active.element, pane);
  const height = Math.max(active.element.getBoundingClientRect().height, 1);
  return {
    line: active.line,
    lineEnd: active.lineEnd,
    offsetRatio: Math.min(Math.max((viewportTop - top) / height, 0), 1),
    absoluteRatio: max <= 0 ? 0 : pane.scrollTop / max,
  };
}

function scrollToSourceAnchor(anchor: ScrollAnchor, pane: HTMLElement) {
  const blocks = getSourceBlocks();
  if (!blocks.length) return false;

  let target = blocks[0]!;
  for (const block of blocks) {
    if (block.line <= anchor.line) {
      target = block;
      continue;
    }
    break;
  }

  const top = getElementTopInPane(target.element, pane);
  const height = Math.max(target.element.getBoundingClientRect().height, 1);
  const lineSpan = Math.max(target.lineEnd - target.line + 1, 1);
  const lineProgress =
    anchor.line >= target.line && anchor.line <= target.lineEnd
      ? (anchor.line - target.line + anchor.offsetRatio) / lineSpan
      : 0;
  pane.scrollTop = Math.max(0, top + height * Math.min(Math.max(lineProgress, 0), 1));
  return true;
}

function scheduleLayoutChange() {
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    emit("layout-change");
  });
}

function onPreviewClick(e: MouseEvent) {
  const image = (e.target as HTMLElement).closest("img.preview-image");
  if (image instanceof HTMLImageElement) {
    const markdownSrc = image.dataset.sheafMdSrc;
    if (!markdownSrc) return;

    const sourceLine = Number(image.dataset.sourceLine);
    e.preventDefault();
    emit("crop-image", {
      previewSrc: image.currentSrc || image.src,
      markdownSrc,
      localPath: image.dataset.sheafLocalSrc ?? null,
      sourceLine: Number.isFinite(sourceLine) ? sourceLine : 0,
    });
    return;
  }

  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return;

  e.preventDefault();
  emit("open-link", href);
}

defineExpose({
  articleEl: articleRef,
  getScrollAnchor,
  scrollToSourceAnchor,
  findNextSearchMatch,
  findPreviousSearchMatch,
});
</script>

<template>
  <article
    ref="articleRef"
    class="preview-article"
    :class="{ 'has-ai-marks': hasAiMarks }"
    @click="onPreviewClick"
    @load.capture="scheduleLayoutChange"
  >
    <div v-if="hasAiMarks" class="preview-ai-legend">
      <span class="preview-ai-legend-item added">
        <span class="preview-ai-legend-swatch" aria-hidden="true" />
        {{ aiAddedLabel }}
      </span>
      <span v-if="hasRemovedMarks" class="preview-ai-legend-item removed">
        <span class="preview-ai-legend-swatch" aria-hidden="true" />
        {{ aiRemovedLabel }}
      </span>
    </div>
    <div class="preview-content" v-html="html" />
  </article>
</template>

<style scoped>
.preview-article {
  min-height: 100%;
}

.preview-ai-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 2.5rem 2rem 0;
  color: var(--ink-text-muted);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.preview-ai-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.preview-ai-legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.preview-ai-legend-item.added .preview-ai-legend-swatch {
  background: color-mix(in srgb, #38a169 42%, transparent);
  box-shadow: inset 2px 0 0 #2f855a;
}

.preview-ai-legend-item.removed .preview-ai-legend-swatch {
  background: color-mix(in srgb, #e53e3e 32%, transparent);
  box-shadow: inset 2px 0 0 #c53030;
}

.preview-article.has-ai-marks .preview-content {
  padding-top: 1rem;
}

.preview-content {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 2.5rem 2rem 4rem;
}

.preview-content :deep(img.preview-image) {
  cursor: pointer;
}
</style>
