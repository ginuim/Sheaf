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
  }>(),
  {
    searchOpen: false,
    searchText: "",
    searchCaseSensitive: false,
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
    @click="onPreviewClick"
    @load.capture="scheduleLayoutChange"
  >
    <div class="preview-content" v-html="html" />
  </article>
</template>

<style scoped>
.preview-article {
  min-height: 100%;
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
