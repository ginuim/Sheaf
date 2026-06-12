<script setup lang="ts">
import type { AISettings } from "../composables/useAI";
import { useLocale } from "../composables/useLocale";

const settings = defineModel<AISettings>({ required: true });
const { t } = useLocale();
</script>

<template>
  <section class="ai-tools-settings">
    <p class="section-desc">{{ t("aiTools.configDesc") }}</p>

    <div class="setting-row">
      <div class="setting-label">
        <span class="setting-name">{{ t("aiTools.webSearch") }}</span>
        <span class="setting-desc">{{ t("aiTools.webSearchDesc") }}</span>
      </div>
      <label class="toggle">
        <input v-model="settings.webSearchEnabled" type="checkbox" />
        <span>{{ t("aiSettings.enable") }}</span>
      </label>
    </div>

    <label v-if="settings.webSearchEnabled" class="field">
      <span class="field-label">{{ t("aiTools.searchResultCount") }}</span>
      <input
        v-model.number="settings.webSearchMaxResults"
        class="setting-input setting-input-narrow"
        type="number"
        min="1"
        max="8"
        step="1"
      />
    </label>
  </section>
</template>

<style scoped>
.ai-tools-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-desc {
  margin: 0;
  font-size: 12px;
  color: var(--ink-text-muted);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ink-border);
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-name,
.field-label {
  font-size: 12px;
  font-weight: 600;
}

.setting-desc {
  font-size: 12px;
  color: var(--ink-text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
}

.setting-input:focus {
  border-color: var(--ink-accent);
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
  cursor: pointer;
  flex-shrink: 0;
}

.toggle input {
  accent-color: var(--ink-accent);
}
</style>
