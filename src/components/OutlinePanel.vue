<script setup lang="ts">
import type { OutlineItem } from "../composables/useOutline";

defineProps<{
  items: OutlineItem[];
}>();

const emit = defineEmits<{
  navigate: [item: OutlineItem];
}>();
</script>

<template>
  <aside class="outline-panel">
    <header class="outline-header">章节大纲</header>
    <nav v-if="items.length" class="outline-nav" aria-label="章节大纲">
      <button
        v-for="item in items"
        :key="`${item.line}-${item.id}`"
        class="outline-item"
        :class="`level-${item.level}`"
        :title="item.text"
        @click="emit('navigate', item)"
      >
        {{ item.text }}
      </button>
    </nav>
    <p v-else class="outline-empty">文档中暂无标题</p>
  </aside>
</template>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  width: 220px;
  flex-shrink: 0;
  background: var(--ink-surface);
  border-left: 1px solid var(--ink-border);
  overflow: hidden;
}

.outline-header {
  padding: 12px 16px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-text-muted);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.outline-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 16px;
}

.outline-item {
  display: block;
  width: 100%;
  padding: 6px 16px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ink-text-muted);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s, background 0.15s;
}

.outline-item:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.outline-item.level-1 {
  font-weight: 600;
  color: var(--ink-text);
}

.outline-item.level-2 {
  padding-left: 24px;
}

.outline-item.level-3 {
  padding-left: 32px;
  font-size: 12px;
}

.outline-item.level-4 {
  padding-left: 40px;
  font-size: 12px;
}

.outline-item.level-5,
.outline-item.level-6 {
  padding-left: 48px;
  font-size: 12px;
  opacity: 0.85;
}

.outline-empty {
  padding: 16px;
  font-size: 13px;
  color: var(--ink-text-muted);
}
</style>
