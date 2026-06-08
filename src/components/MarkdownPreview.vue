<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { renderMermaidIn } from "../composables/useMermaid";
import { renderMarkdown } from "../composables/useMarkdown";
import { useExportTypography } from "../composables/useExportTypography";

const props = defineProps<{
  source: string;
  docFilePath?: string | null;
}>();

const emit = defineEmits<{
  "open-link": [href: string];
}>();

const articleRef = ref<HTMLElement | null>(null);
const { settings: exportTypographySettings } = useExportTypography();
const html = computed(() =>
  renderMarkdown(props.source, props.docFilePath ?? null, {
    chineseEnglishSpacing: exportTypographySettings.chineseEnglishSpacing,
  }),
);

async function renderDynamicBlocks() {
  await nextTick();
  if (articleRef.value) await renderMermaidIn(articleRef.value);
}

onMounted(() => {
  void renderDynamicBlocks();
});

watch(html, () => {
  void renderDynamicBlocks();
});

function onPreviewClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return;

  e.preventDefault();
  emit("open-link", href);
}

defineExpose({
  articleEl: articleRef,
});
</script>

<template>
  <article ref="articleRef" class="preview-article" @click="onPreviewClick">
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
</style>
