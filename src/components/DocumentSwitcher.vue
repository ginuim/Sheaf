<script setup lang="ts">
import { FileText } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";

defineProps<{
  paths: string[];
  activePath: string | null;
}>();

const emit = defineEmits<{
  select: [path: string];
}>();

const { t } = useLocale();

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function parentPath(path: string): string {
  const parts = path.split(/[/\\]/);
  parts.pop();
  return parts.join("/");
}
</script>

<template>
  <aside class="document-switcher" :aria-label="t('documents.ariaLabel')">
    <div class="document-switcher-header">
      <span>{{ t("documents.title") }}</span>
      <span class="document-count">{{ paths.length }}</span>
    </div>

    <div class="document-list">
      <button
        v-for="path in paths"
        :key="path"
        type="button"
        class="document-item"
        :class="{ active: path === activePath }"
        :title="path"
        :aria-current="path === activePath ? 'page' : undefined"
        @click="emit('select', path)"
      >
        <FileText :size="15" class="document-icon" aria-hidden="true" />
        <span class="document-labels">
          <span class="document-name">{{ fileName(path) }}</span>
          <span class="document-parent">{{ parentPath(path) }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.document-switcher {
  display: flex;
  flex: 0 0 224px;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--ink-surface);
  border-right: 1px solid var(--ink-border);
}

.document-switcher-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 12px 0 14px;
  color: var(--ink-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.document-count {
  min-width: 20px;
  padding: 2px 6px;
  color: var(--ink-text-muted);
  text-align: center;
  background: var(--ink-accent-soft);
  border-radius: 999px;
}

.document-list {
  overflow: auto;
  padding: 2px 7px 10px;
}

.document-item {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 8px;
  color: var(--ink-text-muted);
  text-align: left;
  border-radius: 7px;
}

.document-item:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.document-item.active {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
  box-shadow: inset 2px 0 0 var(--ink-accent);
}

.document-icon {
  flex: 0 0 auto;
}

.document-labels {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.document-name,
.document-parent {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-name {
  color: inherit;
  font-size: 13px;
}

.document-parent {
  color: var(--ink-text-muted);
  font-size: 10px;
  opacity: 0.78;
}
</style>
