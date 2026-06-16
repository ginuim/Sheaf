<script setup lang="ts">
import { computed, ref, watch, withDefaults } from "vue";
import {
  useTheme,
} from "../composables/useTheme";
import { useLocale } from "../composables/useLocale";
import type { AppLocale } from "../i18n";
import { useAI } from "../composables/useAI";
import { useAppPreferences } from "../composables/useAppPreferences";
import {
  markdownFormatToolIds,
  type MarkdownFormatToolId,
} from "../types/markdown-format";
import AiProviderSettingsPanel from "./AiProviderSettingsPanel.vue";
import AiToolsSettingsPanel from "./AiToolsSettingsPanel.vue";

type SettingsTab = "appearance" | "formatBar" | "aiModels" | "aiTools";

const props = withDefaults(
  defineProps<{
    open: boolean;
    initialTab?: SettingsTab;
    appVersion?: string;
    updatesEnabled?: boolean;
    onCheckForUpdates?: () => void | Promise<void>;
  }>(),
  {
    appVersion: "",
    updatesEnabled: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const { preference, setPreference } = useTheme();
const { locale, setLocale, t } = useLocale();
const { settings: aiSettings } = useAI();
const { preferences: appPreferences, updateAppPreferences } = useAppPreferences();

function setAutoUpdateEnabled(enabled: boolean) {
  updateAppPreferences({ autoUpdateEnabled: enabled });
}

function setMarkdownFormatBarEnabled(enabled: boolean) {
  updateAppPreferences({ markdownFormatBarEnabled: enabled });
}

function setMarkdownFormatToolEnabled(id: MarkdownFormatToolId, enabled: boolean) {
  updateAppPreferences({
    markdownFormatBarTools: {
      ...appPreferences.markdownFormatBarTools,
      [id]: enabled,
    },
  });
}

const activeTab = ref<SettingsTab>("appearance");

const draggedId = ref<MarkdownFormatToolId | null>(null);

function onDragStart(id: MarkdownFormatToolId, event: DragEvent) {
  draggedId.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }
}

function onDragOver(targetId: MarkdownFormatToolId, event: DragEvent) {
  event.preventDefault();
  if (!draggedId.value || draggedId.value === targetId) return;

  const order = [...appPreferences.markdownFormatBarToolOrder];
  const dragIndex = order.indexOf(draggedId.value);
  const targetIndex = order.indexOf(targetId);

  if (dragIndex !== -1 && targetIndex !== -1) {
    order.splice(dragIndex, 1);
    order.splice(targetIndex, 0, draggedId.value);
    updateAppPreferences({ markdownFormatBarToolOrder: order });
  }
}

function onDragEnd() {
  draggedId.value = null;
}

const tabs = computed(() => [
  { id: "appearance" as const, label: t("settings.tabs.appearance"), icon: "◐" },
  { id: "formatBar" as const, label: t("settings.tabs.formatBar"), icon: "Aa" },
  { id: "aiModels" as const, label: t("settings.tabs.aiModels"), icon: "✦" },
  { id: "aiTools" as const, label: t("settings.tabs.aiTools"), icon: "⚙" },
]);

const appearanceOptions = computed(() => [
  { id: "light" as const, label: t("settings.appearance.themeLight"), hint: t("settings.appearance.themeLightHint") },
  { id: "dark" as const, label: t("settings.appearance.themeDark"), hint: t("settings.appearance.themeDarkHint") },
  { id: "system" as const, label: t("settings.appearance.themeSystem"), hint: t("settings.appearance.themeSystemHint") },
]);

const languageOptions: { id: AppLocale; label: string }[] = [
  { id: "zh-CN", label: "中文" },
  { id: "en", label: "English" },
];

const activeHint = computed(
  () => appearanceOptions.value.find((option) => option.id === preference.value)?.hint ?? "",
);

const tabTitles = computed<Record<SettingsTab, string>>(() => ({
  appearance: t("settings.tabs.appearance"),
  formatBar: t("settings.tabs.formatBar"),
  aiModels: t("settings.tabs.aiModels"),
  aiTools: t("settings.tabs.aiTools"),
}));

const formatToolOptions = computed(() => {
  const order = appPreferences.markdownFormatBarToolOrder || [...markdownFormatToolIds];
  return order.map((id) => ({
    id,
    label: t(`editor.formatBar.${id}`),
  }));
});

watch(
  () => [props.open, props.initialTab] as const,
  ([open, initialTab]) => {
    if (open && initialTab) activeTab.value = initialTab;
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <div
        class="settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <nav class="settings-tabs" :aria-label="t('settings.categories')">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="tab-btn"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </nav>

        <div class="settings-body" :class="{ 'settings-body--panel': activeTab === 'aiModels' }">
          <h2 id="settings-title" class="settings-title">
            {{ tabTitles[activeTab] }}
          </h2>

          <section v-if="activeTab === 'appearance'" class="settings-section">
            <div class="setting-row">
              <div class="setting-label">
                <span class="setting-name">{{ t("settings.appearance.language") }}</span>
                <span class="setting-desc">{{ t("settings.appearance.languageDesc") }}</span>
              </div>
              <div class="segmented" role="radiogroup" :aria-label="t('settings.appearance.language')">
                <button
                  v-for="option in languageOptions"
                  :key="option.id"
                  class="segment-btn"
                  :class="{ active: locale === option.id }"
                  role="radio"
                  :aria-checked="locale === option.id"
                  @click="setLocale(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-label">
                <span class="setting-name">{{ t("settings.appearance.theme") }}</span>
                <span class="setting-desc">{{ activeHint }}</span>
              </div>
              <div class="segmented" role="radiogroup" :aria-label="t('settings.appearance.theme')">
                <button
                  v-for="option in appearanceOptions"
                  :key="option.id"
                  class="segment-btn"
                  :class="{ active: preference === option.id }"
                  role="radio"
                  :aria-checked="preference === option.id"
                  @click="setPreference(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <template v-if="props.updatesEnabled">
              <div class="setting-row">
                <div class="setting-label">
                  <span class="setting-name">{{ t("settings.update.currentVersion") }}</span>
                  <span class="setting-desc">Sheaf {{ props.appVersion || "—" }}</span>
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-label">
                  <span class="setting-name">{{ t("settings.update.autoCheck") }}</span>
                  <span class="setting-desc">{{ t("settings.update.autoCheckDescription") }}</span>
                </div>
                <label class="toggle">
                  <input
                    :checked="appPreferences.autoUpdateEnabled"
                    type="checkbox"
                    @change="setAutoUpdateEnabled(!appPreferences.autoUpdateEnabled)"
                  />
                  <span>{{
                    appPreferences.autoUpdateEnabled
                      ? t("settings.appearance.on")
                      : t("settings.appearance.off")
                  }}</span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-label">
                  <span class="setting-name">{{ t("settings.update.title") }}</span>
                  <span class="setting-desc">{{ t("settings.update.description") }}</span>
                </div>
                <button class="settings-action-btn" type="button" @click="props.onCheckForUpdates?.()">
                  {{ t("settings.update.check") }}
                </button>
              </div>
            </template>
          </section>

          <section v-else-if="activeTab === 'formatBar'" class="settings-section">
            <div class="setting-row">
              <div class="setting-label">
                <span class="setting-name">{{ t("settings.formatBar.enabled") }}</span>
                <span class="setting-desc">{{ t("settings.formatBar.enabledDesc") }}</span>
              </div>
              <label class="toggle">
                <input
                  :checked="appPreferences.markdownFormatBarEnabled"
                  type="checkbox"
                  @change="setMarkdownFormatBarEnabled(!appPreferences.markdownFormatBarEnabled)"
                />
                <span>{{
                  appPreferences.markdownFormatBarEnabled
                    ? t("settings.appearance.on")
                    : t("settings.appearance.off")
                }}</span>
              </label>
            </div>

            <div class="setting-row setting-row-col">
              <div class="setting-label">
                <span class="setting-name">{{ t("settings.formatBar.tools") }}</span>
                <span class="setting-desc">{{ t("settings.formatBar.toolsDesc") }}</span>
              </div>
              <div class="format-tool-grid">
                <div
                  v-for="tool in formatToolOptions"
                  :key="tool.id"
                  class="format-tool-item"
                  :class="{ dragging: draggedId === tool.id }"
                  draggable="true"
                  @dragstart="onDragStart(tool.id, $event)"
                  @dragover="onDragOver(tool.id, $event)"
                  @dragend="onDragEnd"
                >
                  <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                  <label class="format-tool-toggle">
                    <input
                      :checked="appPreferences.markdownFormatBarTools[tool.id]"
                      type="checkbox"
                      @change="setMarkdownFormatToolEnabled(tool.id, !appPreferences.markdownFormatBarTools[tool.id])"
                    />
                    <span>{{ tool.label }}</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeTab === 'aiModels'" class="settings-section ai-settings-section">
            <AiProviderSettingsPanel v-model="aiSettings" />
          </section>

          <section v-else class="settings-section ai-settings-section">
            <AiToolsSettingsPanel v-model="aiSettings" />
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(2px);
  -webkit-app-region: no-drag;
}

.settings-window {
  width: min(760px, calc(100vw - 48px));
  height: min(560px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border-strong);
  border-radius: 12px;
  box-shadow:
    0 24px 48px var(--ink-shadow),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.settings-tabs {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--ink-bg);
  border-bottom: 1px solid var(--ink-border);
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 72px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--ink-text-muted);
  transition:
    background 0.15s,
    color 0.15s;
}

.tab-btn:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.tab-btn.active {
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
}

.tab-icon {
  font-size: 18px;
  line-height: 1;
}

.tab-label {
  font-size: 11px;
  font-weight: 500;
}

.settings-body {
  flex: 1;
  padding: 24px 28px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
  letter-spacing: -0.02em;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-body--panel {
  overflow: hidden;
}

.ai-settings-section {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ink-border);
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.setting-name {
  font-size: 13px;
  font-weight: 500;
}

.setting-desc {
  font-size: 12px;
  color: var(--ink-text-muted);
}

.segmented {
  display: flex;
  flex-shrink: 0;
  background: var(--ink-bg);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.segment-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text-muted);
  border-radius: 6px;
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s,
    box-shadow 0.15s;
}

.segment-btn:hover {
  color: var(--ink-text);
}

.segment-btn.active {
  background: var(--ink-surface);
  color: var(--ink-text);
  box-shadow: 0 1px 3px var(--ink-shadow);
}

.setting-row-col {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.setting-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  font-family: var(--font-mono, monospace);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border-strong);
  border-radius: 6px;
  color: var(--ink-text);
  outline: none;
  transition: border-color 0.15s;
}

.setting-input:focus {
  border-color: var(--ink-accent);
}

.format-tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  width: 100%;
}

.format-tool-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
  transition: all 0.15s;
  user-select: none;
}

.format-tool-item:hover {
  border-color: var(--ink-border-strong);
  background: var(--ink-accent-soft);
}

.format-tool-item.dragging {
  opacity: 0.4;
  border-style: dashed;
  border-color: var(--ink-accent);
}

.drag-handle {
  color: var(--ink-text-muted);
  cursor: grab;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  opacity: 0.6;
}

.drag-handle:hover {
  opacity: 1;
}

.format-tool-item:active .drag-handle {
  cursor: grabbing;
}

.format-tool-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-height: 24px;
  color: var(--ink-text);
  font-size: 12px;
  cursor: pointer;
}

.format-tool-toggle input {
  accent-color: var(--ink-accent);
  cursor: pointer;
}

.setting-input-narrow {
  width: 72px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-text-muted);
  flex-shrink: 0;
  cursor: pointer;
}

.toggle input {
  accent-color: var(--ink-accent);
}

.settings-action-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border-strong);
  border-radius: 6px;
  flex-shrink: 0;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.settings-action-btn:hover {
  background: var(--ink-accent-soft);
  border-color: var(--ink-accent);
}
</style>
