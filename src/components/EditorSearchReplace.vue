<script setup lang="ts">
import { nextTick, ref } from "vue";
import { CaseSensitive, ChevronDown, ChevronUp, Replace } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";

const { t } = useLocale();

defineProps<{
  searchText: string;
  replaceText: string;
  caseSensitive: boolean;
  replaceOpen: boolean;
  searchCountText: string;
  hasMatches: boolean;
}>();

const emit = defineEmits<{
  "update:searchText": [value: string];
  "update:replaceText": [value: string];
  "update:caseSensitive": [value: boolean];
  "update:replaceOpen": [value: boolean];
  findNext: [];
  findPrevious: [];
  replaceNext: [];
  replaceAll: [];
  close: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);

function focusSearch() {
  void nextTick(() => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  });
}

function focusReplace() {
  void nextTick(() => {
    replaceInputRef.value?.focus();
    replaceInputRef.value?.select();
  });
}

function toggleCaseSensitive(value: boolean) {
  emit("update:caseSensitive", !value);
}

function toggleReplace(value: boolean) {
  const nextValue = !value;
  emit("update:replaceOpen", nextValue);
  void nextTick(() => {
    if (nextValue) replaceInputRef.value?.focus();
    else searchInputRef.value?.focus();
  });
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) emit("findPrevious");
    else emit("findNext");
  } else if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

function onReplaceKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    emit("replaceNext");
  } else if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

defineExpose({
  focusSearch,
  focusReplace,
});
</script>

<template>
  <div
    class="search-bar"
    role="search"
    :aria-label="t('search.ariaLabel')"
    @keydown.stop
  >
    <div class="search-row">
      <input
        ref="searchInputRef"
        :value="searchText"
        class="search-input"
        type="search"
        :placeholder="t('search.placeholder')"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:searchText', ($event.target as HTMLInputElement).value)"
        @keydown="onSearchKeydown"
      />
      <span class="search-count" aria-live="polite">
        {{ searchCountText }}
      </span>
      <button
        type="button"
        class="search-btn"
        :class="{ 'search-btn--active': caseSensitive }"
        :title="t('search.caseSensitive')"
        :aria-label="t('search.caseSensitive')"
        :aria-pressed="caseSensitive"
        @click="toggleCaseSensitive(caseSensitive)"
      >
        <CaseSensitive :size="14" />
      </button>
      <button
        type="button"
        class="search-btn"
        :title="t('search.previous')"
        :aria-label="t('search.previousMatch')"
        :disabled="!hasMatches"
        @click="emit('findPrevious')"
      >
        <ChevronUp :size="14" />
      </button>
      <button
        type="button"
        class="search-btn"
        :title="t('search.next')"
        :aria-label="t('search.nextMatch')"
        :disabled="!hasMatches"
        @click="emit('findNext')"
      >
        <ChevronDown :size="14" />
      </button>
      <button
        type="button"
        class="search-btn"
        :class="{ 'search-btn--active': replaceOpen }"
        :title="t('search.showReplace')"
        :aria-label="t('search.showReplace')"
        :aria-pressed="replaceOpen"
        @click="toggleReplace(replaceOpen)"
      >
        <Replace :size="14" />
      </button>
      <button
        type="button"
        class="search-close"
        :title="t('search.close')"
        :aria-label="t('search.closeSearch')"
        @click="emit('close')"
      >
        ×
      </button>
    </div>
    <div v-if="replaceOpen" class="search-row search-row--replace">
      <input
        ref="replaceInputRef"
        :value="replaceText"
        class="search-input"
        type="text"
        :placeholder="t('search.replacePlaceholder')"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:replaceText', ($event.target as HTMLInputElement).value)"
        @keydown="onReplaceKeydown"
      />
      <button
        type="button"
        class="search-text-btn"
        :disabled="!hasMatches"
        @click="emit('replaceNext')"
      >
        {{ t("search.replace") }}
      </button>
      <button
        type="button"
        class="search-text-btn"
        :disabled="!hasMatches"
        @click="emit('replaceAll')"
      >
        {{ t("search.replaceAll") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-bar {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(calc(100% - 2rem), 420px);
  padding: 8px 10px;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--ink-shadow);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-row--replace {
  padding-left: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--ink-text);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
}

.search-input:focus {
  outline: none;
  border-color: var(--ink-accent);
}

.search-count {
  flex-shrink: 0;
  width: 4.25rem;
  color: var(--ink-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.search-btn,
.search-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  font-size: 14px;
  color: var(--ink-text-muted);
  border-radius: 6px;
}

.search-btn:hover:not(:disabled),
.search-close:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.search-btn--active {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.search-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.search-text-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--ink-text);
  border-radius: 6px;
  white-space: nowrap;
}

.search-text-btn:hover:not(:disabled) {
  background: var(--ink-accent-soft);
}

.search-text-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.search-close {
  font-size: 18px;
  line-height: 1;
}
</style>
