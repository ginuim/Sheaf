<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getMissingRecent } from "../composables/useRecentFiles";
import { formatDraftUpdatedAt, type UnsavedDraft } from "../composables/useDraftRecovery";
import { useLocale } from "../composables/useLocale";

const { t } = useLocale();

const props = defineProps<{
  recentFiles: string[];
  recoverableDraft?: UnsavedDraft | null;
}>();

const emit = defineEmits<{
  newDoc: [];
  open: [];
  openRecent: [path: string];
  removeRecent: [path: string];
  clearRecent: [];
  recoverDraft: [];
  discardDraft: [];
}>();

const recoveryTitle = computed(() => {
  const draft = props.recoverableDraft;
  if (!draft) return "";
  return draft.filePath ? fileName(draft.filePath) : draft.fileName;
});

const missingPaths = ref<Set<string>>(new Set());

async function refreshMissing() {
  missingPaths.value = await getMissingRecent(props.recentFiles);
}

onMounted(refreshMissing);
watch(() => props.recentFiles, refreshMissing);

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
  <section class="start-page" :aria-label="t('startPage.ariaLabel')">
    <div class="start-panel">
      <div class="start-main">
        <p class="eyebrow">Sheaf</p>
        <h1>{{ t("startPage.title") }}</h1>
        <p class="intro">
          {{ t("startPage.intro") }}
        </p>

        <p v-if="recoverableDraft" class="recovery-hint">
          <span>{{ t("startPage.unsavedDraft", { title: recoveryTitle }) }}</span>
          <span class="recovery-time">{{ formatDraftUpdatedAt(recoverableDraft.updatedAt) }}</span>
          <button class="recovery-link" type="button" @click="emit('recoverDraft')">{{ t("startPage.continueEdit") }}</button>
          <span class="recovery-sep" aria-hidden="true">·</span>
          <button class="recovery-link recovery-link-muted" type="button" @click="emit('discardDraft')">
            {{ t("startPage.discard") }}
          </button>
        </p>

        <div class="actions">
          <button class="primary-action" @click="emit('newDoc')">
            {{ t("startPage.newDoc") }}
          </button>
          <button class="secondary-action" @click="emit('open')">
            {{ t("startPage.openMarkdown") }}
          </button>
        </div>
      </div>

      <div class="recent-section">
        <div class="recent-header">
          <div>
            <h2>{{ t("startPage.recentDocs") }}</h2>
            <p>{{ t("startPage.recentHint") }}</p>
          </div>
          <button
            v-if="recentFiles.length > 0"
            class="clear-btn"
            @click="emit('clearRecent')"
          >
            {{ t("startPage.clear") }}
          </button>
        </div>

        <div v-if="recentFiles.length === 0" class="empty-recent">
          {{ t("startPage.noRecent") }}
        </div>
        <div
          v-for="path in recentFiles"
          v-else
          :key="path"
          class="recent-row"
          :class="{ 'recent-row-missing': missingPaths.has(path) }"
        >
          <button
            class="recent-item"
            @click="emit('openRecent', path)"
          >
            <span class="recent-name-row">
              <span class="recent-name">{{ fileName(path) }}</span>
              <span v-if="missingPaths.has(path)" class="recent-missing-badge">
                {{ t("startPage.fileMissing") }}
              </span>
            </span>
            <span class="recent-path">{{ parentPath(path) }}</span>
          </button>
          <button
            type="button"
            class="recent-remove"
            :title="t('startPage.removeFromList')"
            :aria-label="t('startPage.removeFromList')"
            @click="emit('removeRecent', path)"
          >
            <svg
              class="recent-remove-icon"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <circle
                cx="8"
                cy="8"
                r="6.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1"
              />
              <line
                x1="3.5"
                y1="12.5"
                x2="12.5"
                y2="3.5"
                stroke="currentColor"
                stroke-width="1"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(18px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.start-page {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  overflow: auto;
}

.start-panel {
  width: min(620px, 100%);
  max-height: min(720px, calc(100% - 64px));
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 18px;
  box-shadow: 0 18px 48px var(--ink-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fade-in-up 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.start-main > * {
  animation: fade-in-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.start-main > *:nth-child(1) {
  animation-delay: 0.1s;
}

.start-main > *:nth-child(2) {
  animation-delay: 0.18s;
}

.start-main > *:nth-child(3) {
  animation-delay: 0.26s;
}

.start-main > *:nth-child(4) {
  animation-delay: 0.34s;
}

.recent-section {
  animation: fade-in-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.42s both;
}

.start-main {
  padding: 38px 40px 32px;
  text-align: center;
  flex-shrink: 0;
}

.eyebrow {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-accent);
}

h1 {
  margin-bottom: 12px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.03em;
}

.intro {
  max-width: 32em;
  margin: 0 auto;
  color: var(--ink-text-muted);
  line-height: 1.7;
}

.recovery-hint {
  max-width: 32em;
  margin: 16px auto 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-text-muted);
  text-align: center;
}

.recovery-time::before {
  content: "·";
  margin: 0 0.35em;
}

.recovery-link {
  margin: 0 0.15em;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--ink-accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.recovery-link:hover {
  opacity: 0.85;
}

.recovery-link-muted {
  color: var(--ink-text-muted);
  font-weight: 500;
}

.recovery-sep {
  margin: 0 0.2em;
  color: var(--ink-text-muted);
  text-decoration: none;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
}

.primary-action,
.secondary-action {
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s;
}

.primary-action {
  color: var(--ink-surface);
  background: var(--ink-accent);
}

.secondary-action {
  color: var(--ink-text);
  border: 1px solid var(--ink-border-strong);
}

.primary-action:hover,
.secondary-action:hover {
  transform: translateY(-1px);
}

.secondary-action:hover {
  background: var(--ink-accent-soft);
  border-color: var(--ink-accent);
}

.recent-section {
  padding: 22px 24px 24px;
  border-top: 1px solid var(--ink-border);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.recent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.recent-header h2 {
  margin-bottom: 4px;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.recent-header p {
  color: var(--ink-text-muted);
  font-size: 12px;
}

.clear-btn {
  padding: 6px 10px;
  color: var(--ink-text-muted);
  font-size: 12px;
  border-radius: 8px;
}

.clear-btn:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.empty-recent {
  padding: 36px 12px;
  color: var(--ink-text-muted);
  text-align: center;
  border: 1px dashed var(--ink-border-strong);
  border-radius: 12px;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 10px;
  border-radius: 12px;
}

.recent-row:hover {
  background: var(--ink-accent-soft);
}

.recent-row-missing {
  opacity: 0.72;
}

.recent-row-missing:hover {
  background: color-mix(in srgb, var(--ink-text-muted) 8%, transparent);
}

.recent-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
  gap: 4px;
  padding: 12px;
  color: var(--ink-text);
  text-align: left;
  border-radius: 12px;
}

.recent-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  color: color-mix(in srgb, var(--ink-text-muted) 26%, transparent);
  border: none;
  border-radius: 50%;
  background: transparent;
  transition:
    color 0.15s,
    background 0.15s,
    transform 0.15s;
}

.recent-remove:hover {
  color: color-mix(in srgb, var(--ink-text-muted) 58%, transparent);
  background: color-mix(in srgb, var(--ink-text-muted) 12%, transparent);
  transform: scale(1.08);
}

.recent-remove-icon {
  display: block;
  width: 16px;
  height: 16px;
}

.recent-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
}

.recent-name {
  max-width: 100%;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.recent-missing-badge {
  flex-shrink: 0;
  padding: 2px 7px;
  color: var(--ink-text-muted);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--ink-border-strong);
  border-radius: 999px;
}

.recent-path {
  max-width: 100%;
  color: var(--ink-text-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .start-page {
    padding: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .start-panel,
  .start-main > *,
  .recent-section {
    animation: none;
  }
}
</style>
