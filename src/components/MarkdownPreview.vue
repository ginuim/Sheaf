<script setup lang="ts">
import { computed, ref } from "vue";
import { renderMarkdown } from "../composables/useMarkdown";

const props = defineProps<{
  source: string;
  docFilePath?: string | null;
}>();

const articleRef = ref<HTMLElement | null>(null);
const html = computed(() =>
  renderMarkdown(props.source, props.docFilePath ?? null),
);

defineExpose({
  articleEl: articleRef,
});
</script>

<template>
  <article ref="articleRef" class="preview-article">
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
