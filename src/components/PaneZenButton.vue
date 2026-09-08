<script setup lang="ts">
import { Maximize2, Minimize2 } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";

defineProps<{
  active: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const { t } = useLocale();
</script>

<template>
  <button
    type="button"
    class="pane-zen-btn"
    :class="{ 'is-active': active }"
    :title="active ? t('editor.zenExit') : t('editor.zenEnter')"
    :aria-label="active ? t('editor.zenExit') : t('editor.zenEnter')"
    :aria-pressed="active"
    @click="emit('toggle')"
  >
    <Minimize2 v-if="active" :size="15" aria-hidden="true" />
    <Maximize2 v-else :size="15" aria-hidden="true" />
  </button>
</template>

<style scoped>
.pane-zen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  color: var(--ink-text-muted);
  background: color-mix(in srgb, var(--ink-surface) 88%, transparent);
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--ink-shadow);
  -webkit-app-region: no-drag;
  opacity: 0.72;
  transition:
    opacity 0.15s,
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}

.pane-zen-btn:hover,
.pane-zen-btn.is-active {
  opacity: 1;
  color: var(--ink-text);
  background: var(--ink-surface);
  border-color: var(--ink-border-strong);
}
</style>
