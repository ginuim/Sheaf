<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  isBuiltinProvider,
  localizedBuiltinModelName,
  localizedBuiltinProviderName,
} from "../ai-providers/catalog";
import { aiModelCapabilities, toggleModelCapability } from "../ai-providers/capabilities";
import type { AiModelCapability } from "../ai-providers/types";
import {
  createCustomAiProvider,
  patchProviderInSettings,
} from "../ai-providers/settings";
import type { AISettings } from "../composables/useAI";
import { useLocale } from "../composables/useLocale";
import type { AiProviderConfig, AiProviderModel } from "../ai-providers/types";

type ProviderDraft = {
  apiKey: string;
  baseUrl: string;
  name: string;
  enabled: boolean;
  agentDefaultModelId: string;
  models: AiProviderModel[];
};

const settings = defineModel<AISettings>({ required: true });
const { t } = useLocale();

const selectedProviderId = ref(settings.value.agentDefaultProviderId ?? settings.value.providers[0]?.id);
const providerSearch = ref("");
const editingModelId = ref<string | null>(null);
const isAddingModel = ref(false);
const providerDraft = ref<ProviderDraft | null>(null);

const modelDraft = ref({
  id: "",
  name: "",
  capabilities: ["text"] as AiModelCapability[],
});

const editModelDraft = ref({
  id: "",
  name: "",
  capabilities: ["text"] as AiModelCapability[],
});

function displayProviderName(provider: AiProviderConfig) {
  if (isBuiltinProvider(provider.id)) {
    return localizedBuiltinProviderName(provider.id, provider.name);
  }
  return provider.name;
}

function displayModelName(provider: AiProviderConfig, model: AiProviderModel) {
  if (isBuiltinProvider(provider.id)) {
    return localizedBuiltinModelName(provider.id, model.id, model.name);
  }
  return model.name;
}

const capabilityLabels = computed<Record<AiModelCapability, string>>(() => ({
  text: t("aiSettings.capability.text"),
  vision: t("aiSettings.capability.vision"),
  image: t("aiSettings.capability.image"),
  reasoning: t("aiSettings.capability.reasoning"),
  tools: t("aiSettings.capability.tools"),
  web: t("aiSettings.capability.web"),
}));

const visibleProviders = computed(() => {
  const query = providerSearch.value.trim().toLowerCase();
  if (!query) return settings.value.providers;
  return settings.value.providers.filter((provider) =>
    displayProviderName(provider).toLowerCase().includes(query),
  );
});

const selectedProvider = computed(() =>
  settings.value.providers.find((provider) => provider.id === selectedProviderId.value) ??
  settings.value.providers[0] ??
  null,
);

const enabledAgentModels = computed(() => {
  const draft = providerDraft.value;
  if (!draft) return [];
  return draft.models.filter((model) => model.enabled && model.capabilities.includes("text"));
});

const selectedProviderEnabled = computed({
  get: () => providerDraft.value?.enabled ?? false,
  set: (enabled: boolean) => {
    if (!providerDraft.value) return;
    providerDraft.value.enabled = enabled;
  },
});

function syncDraftFromProvider(provider: AiProviderConfig) {
  const isCurrentDefault = settings.value.agentDefaultProviderId === provider.id;
  providerDraft.value = {
    apiKey: provider.apiKey ?? "",
    baseUrl: provider.baseUrl ?? "",
    name: provider.name,
    enabled: provider.enabled,
    agentDefaultModelId: isCurrentDefault
      ? (settings.value.agentDefaultModelId ?? provider.defaultModelId ?? "")
      : (provider.defaultModelId ?? ""),
    models: provider.models.map((model) => ({
      ...model,
      capabilities: [...model.capabilities],
    })),
  };
}

watch(
  () => selectedProvider.value?.id,
  () => {
    const provider = selectedProvider.value;
    if (provider) syncDraftFromProvider(provider);
  },
  { immediate: true },
);

function selectProvider(providerId: string) {
  selectedProviderId.value = providerId;
  editingModelId.value = null;
  isAddingModel.value = false;
}

function updateDraftApiKey(value: string) {
  if (!providerDraft.value) return;
  providerDraft.value.apiKey = value;
  if (value.trim()) {
    providerDraft.value.enabled = true;
  }
}

function saveProviderDraft() {
  const provider = selectedProvider.value;
  const draft = providerDraft.value;
  if (!provider || !draft) return;

  const apiKey = draft.apiKey.trim();
  const enabled = apiKey.length > 0 ? true : draft.enabled;
  const agentDefaultModelId =
    draft.agentDefaultModelId ||
    enabledAgentModels.value[0]?.id ||
    provider.defaultModelId ||
    draft.models[0]?.id ||
    "";

  patchProviderInSettings(settings.value, provider.id, (current) => ({
    ...current,
    apiKey: draft.apiKey,
    baseUrl: draft.baseUrl.trim() || current.baseUrl,
    name: draft.name.trim() || current.name,
    enabled,
    defaultModelId: agentDefaultModelId,
    models: draft.models.map((model) => ({
      ...model,
      capabilities: [...model.capabilities],
    })),
  }));

  if (agentDefaultModelId) {
    settings.value.agentDefaultProviderId = provider.id;
    settings.value.agentDefaultModelId = agentDefaultModelId;
  }

  const savedProvider = settings.value.providers.find((item) => item.id === provider.id);
  if (savedProvider) syncDraftFromProvider(savedProvider);
}

function addProvider() {
  const customCount = settings.value.providers.filter((provider) =>
    provider.id.startsWith("custom-provider-"),
  ).length;
  const provider = createCustomAiProvider(customCount + 1);
  settings.value.providers.push(provider);
  selectProvider(provider.id);
}

function deleteProvider() {
  const provider = selectedProvider.value;
  if (!provider || !provider.id.startsWith("custom-provider-")) return;
  const index = settings.value.providers.findIndex((item) => item.id === provider.id);
  if (index < 0) return;
  settings.value.providers.splice(index, 1);
  if (settings.value.agentDefaultProviderId === provider.id) {
    settings.value.agentDefaultProviderId = settings.value.providers[0]?.id;
  }
  selectProvider(settings.value.providers[0]?.id ?? "");
}

function startEditModel(model: AiProviderModel) {
  editingModelId.value = model.id;
  editModelDraft.value = {
    id: model.id,
    name: model.name,
    capabilities: [...model.capabilities],
  };
  isAddingModel.value = false;
}

function saveEditedModel() {
  const draft = providerDraft.value;
  const editingId = editingModelId.value;
  if (!draft || !editingId) return;
  const id = editModelDraft.value.id.trim();
  const name = editModelDraft.value.name.trim() || id;
  if (!id || editModelDraft.value.capabilities.length === 0) return;

  draft.models = draft.models.map((model) =>
    model.id === editingId
      ? {
          ...model,
          id,
          name,
          capabilities: [...editModelDraft.value.capabilities],
        }
      : model,
  );
  if (draft.agentDefaultModelId === editingId) {
    draft.agentDefaultModelId = id;
  }
  editingModelId.value = null;
}

function removeModel(modelId: string) {
  const draft = providerDraft.value;
  if (!draft) return;
  draft.models = draft.models.filter((model) => model.id !== modelId);
  if (draft.agentDefaultModelId === modelId) {
    draft.agentDefaultModelId = enabledAgentModels.value[0]?.id ?? "";
  }
}

function addModel() {
  const draft = providerDraft.value;
  if (!draft) return;
  const id = modelDraft.value.id.trim();
  const name = modelDraft.value.name.trim() || id;
  if (!id || modelDraft.value.capabilities.length === 0) return;
  if (draft.models.some((model) => model.id === id)) return;

  draft.models = [
    ...draft.models,
    {
      id,
      name,
      enabled: true,
      capabilities: [...modelDraft.value.capabilities],
    },
  ];

  modelDraft.value = { id: "", name: "", capabilities: ["text"] };
  isAddingModel.value = false;
}

function toggleModelEnabled(modelId: string, enabled: boolean) {
  const draft = providerDraft.value;
  if (!draft) return;
  draft.models = draft.models.map((model) =>
    model.id === modelId ? { ...model, enabled } : model,
  );
  if (!enabled && draft.agentDefaultModelId === modelId) {
    draft.agentDefaultModelId = enabledAgentModels.value[0]?.id ?? "";
  }
}
</script>

<template>
  <div class="ai-provider-layout">
    <aside class="provider-sidebar">
      <input
        v-model="providerSearch"
        class="setting-input"
        :placeholder="t('aiSettings.searchProvider')"
        spellcheck="false"
      />
      <div class="provider-list">
        <button
          v-for="provider in visibleProviders"
          :key="provider.id"
          class="provider-item"
          :class="{ active: provider.id === selectedProvider?.id }"
          @click="selectProvider(provider.id)"
        >
          <span class="provider-name-row">
            <span
              v-if="provider.enabled"
              class="provider-enabled-dot"
              aria-hidden="true"
              :title="t('aiSettings.enabled')"
            />
            <span class="provider-name">{{ displayProviderName(provider) }}</span>
          </span>
        </button>
      </div>
      <button class="ghost-btn" type="button" @click="addProvider">{{ t("aiSettings.addCustom") }}</button>
    </aside>

    <section v-if="selectedProvider && providerDraft" class="provider-detail">
      <div class="detail-header">
        <div>
          <h3 class="detail-title">{{ displayProviderName(selectedProvider) }}</h3>
          <p class="detail-desc">{{ t("aiSettings.configDesc") }}</p>
        </div>
        <div class="detail-actions">
          <label class="toggle">
            <input v-model="selectedProviderEnabled" type="checkbox" />
            <span>{{ t("aiSettings.enable") }}</span>
          </label>
          <button
            v-if="selectedProvider.id.startsWith('custom-provider-')"
            class="ghost-btn danger"
            type="button"
            @click="deleteProvider"
          >
            {{ t("aiSettings.delete") }}
          </button>
        </div>
      </div>

      <div class="detail-section">
        <label class="field">
          <span class="field-label">{{ t("aiSettings.apiUrl") }}</span>
          <input
            v-model="providerDraft.baseUrl"
            class="setting-input"
            spellcheck="false"
          />
        </label>
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            :value="providerDraft.apiKey"
            class="setting-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            @input="updateDraftApiKey(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="selectedProvider.id.startsWith('custom-provider-')" class="field">
          <span class="field-label">{{ t("aiSettings.providerName") }}</span>
          <input
            v-model="providerDraft.name"
            class="setting-input"
            spellcheck="false"
          />
        </label>
      </div>

      <div class="detail-section">
        <label class="field">
          <span class="field-label">{{ t("aiSettings.defaultModel") }}</span>
          <select
            v-model="providerDraft.agentDefaultModelId"
            class="setting-input"
          >
            <option
              v-for="model in enabledAgentModels"
              :key="model.id"
              :value="model.id"
            >
              {{ displayModelName(selectedProvider, model) }}
            </option>
          </select>
        </label>
      </div>

      <div class="detail-section">
        <div class="section-head">
          <span class="field-label">{{ t("aiSettings.modelList") }}</span>
          <button class="ghost-btn" type="button" @click="isAddingModel = !isAddingModel">
            {{ isAddingModel ? t("aiSettings.cancel") : t("aiSettings.addModel") }}
          </button>
        </div>

        <div v-if="isAddingModel" class="model-editor">
          <input
            v-model="modelDraft.id"
            class="setting-input"
            :placeholder="t('aiSettings.modelIdPlaceholder')"
            spellcheck="false"
          />
          <input
            v-model="modelDraft.name"
            class="setting-input"
            :placeholder="t('aiSettings.displayNamePlaceholder')"
            spellcheck="false"
          />
          <div class="capability-picker">
            <button
              v-for="capability in aiModelCapabilities"
              :key="capability"
              class="cap-btn"
              :class="{ active: modelDraft.capabilities.includes(capability) }"
              type="button"
              @click="modelDraft.capabilities = toggleModelCapability(modelDraft.capabilities, capability)"
            >
              {{ capabilityLabels[capability] }}
            </button>
          </div>
          <button class="ghost-btn" type="button" @click="addModel">{{ t("aiSettings.saveModel") }}</button>
        </div>

        <div class="model-list">
          <div v-for="model in providerDraft.models" :key="model.id" class="model-row">
            <template v-if="editingModelId === model.id">
              <div class="model-editor">
                <input v-model="editModelDraft.id" class="setting-input" spellcheck="false" />
                <input v-model="editModelDraft.name" class="setting-input" spellcheck="false" />
                <div class="capability-picker">
                  <button
                    v-for="capability in aiModelCapabilities"
                    :key="capability"
                    class="cap-btn"
                    :class="{ active: editModelDraft.capabilities.includes(capability) }"
                    type="button"
                    @click="editModelDraft.capabilities = toggleModelCapability(editModelDraft.capabilities, capability)"
                  >
                    {{ capabilityLabels[capability] }}
                  </button>
                </div>
                <div class="model-row-actions">
                  <button class="ghost-btn" type="button" @click="saveEditedModel">{{ t("aiSettings.save") }}</button>
                  <button class="ghost-btn" type="button" @click="editingModelId = null">{{ t("aiSettings.cancel") }}</button>
                </div>
              </div>
            </template>
            <template v-else>
              <label class="model-main toggle">
                <input
                  :checked="model.enabled"
                  type="checkbox"
                  @change="toggleModelEnabled(model.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>
                  <strong>{{ displayModelName(selectedProvider, model) }}</strong>
                  <small>{{ model.id }}</small>
                </span>
              </label>
              <div class="capability-picker compact">
                <span
                  v-for="capability in model.capabilities"
                  :key="capability"
                  class="cap-pill"
                >
                  {{ capabilityLabels[capability] }}
                </span>
              </div>
              <div class="model-row-actions">
                <button class="ghost-btn" type="button" @click="startEditModel(model)">{{ t("aiSettings.edit") }}</button>
                <button class="ghost-btn danger" type="button" @click="removeModel(model.id)">{{ t("aiSettings.delete") }}</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="detail-section save-section">
        <button class="primary-btn" type="button" @click="saveProviderDraft">
          {{ t("aiSettings.saveProvider") }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai-provider-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
  min-height: 360px;
}

.provider-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.provider-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.provider-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  color: var(--ink-text-muted);
  background: transparent;
  border: 1px solid transparent;
}

.provider-item:hover,
.provider-item.active {
  background: var(--ink-accent-soft);
  border-color: var(--ink-border);
  color: var(--ink-text);
}

.provider-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.provider-enabled-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.25);
}

.provider-name {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-detail {
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.detail-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
}

.detail-desc {
  margin: 0;
  font-size: 12px;
  color: var(--ink-text-muted);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--ink-border);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label,
.setting-name {
  font-size: 12px;
  font-weight: 600;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
}

.model-main {
  min-width: 0;
}

.model-main strong {
  display: block;
  font-size: 12px;
}

.model-main small {
  display: block;
  font-size: 10px;
  color: var(--ink-text-muted);
  font-family: var(--font-mono, monospace);
}

.model-row-actions {
  display: flex;
  gap: 4px;
}

.model-editor {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.capability-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.capability-picker.compact .cap-pill {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--ink-bg);
  color: var(--ink-text-muted);
}

.cap-btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--ink-border);
  background: var(--ink-bg);
  color: var(--ink-text-muted);
}

.cap-btn.active {
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  border-color: var(--ink-accent);
}

.ghost-btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--ink-text-muted);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
}

.ghost-btn:hover {
  color: var(--ink-text);
}

.ghost-btn.danger {
  color: #c44;
}

.primary-btn {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  color: #fff;
  background: var(--ink-accent);
  border: 1px solid var(--ink-accent);
}

.primary-btn:hover {
  opacity: 0.92;
}

.save-section {
  padding-bottom: 4px;
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

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-text-muted);
  cursor: pointer;
}

.toggle input {
  accent-color: var(--ink-accent);
}

@media (max-width: 720px) {
  .ai-provider-layout {
    grid-template-columns: 1fr;
  }
}
</style>
