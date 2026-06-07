<script setup lang="ts">
import { computed, ref } from "vue";
import { aiModelCapabilities, toggleModelCapability } from "../ai-providers/capabilities";
import type { AiModelCapability } from "../ai-providers/types";
import {
  createCustomAiProvider,
  patchProviderInSettings,
} from "../ai-providers/settings";
import type { AISettings } from "../composables/useAI";
import type { AiProviderConfig, AiProviderModel } from "../ai-providers/types";

const settings = defineModel<AISettings>({ required: true });

const selectedProviderId = ref(settings.value.agentDefaultProviderId ?? settings.value.providers[0]?.id);
const providerSearch = ref("");
const editingModelId = ref<string | null>(null);
const isAddingModel = ref(false);

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

const capabilityLabels: Record<AiModelCapability, string> = {
  text: "文本",
  vision: "视觉",
  image: "生图",
  reasoning: "推理",
  tools: "工具",
  web: "联网",
};

const visibleProviders = computed(() => {
  const query = providerSearch.value.trim().toLowerCase();
  if (!query) return settings.value.providers;
  return settings.value.providers.filter((provider) =>
    provider.name.toLowerCase().includes(query),
  );
});

const selectedProvider = computed(() =>
  settings.value.providers.find((provider) => provider.id === selectedProviderId.value) ??
  settings.value.providers[0] ??
  null,
);

const enabledAgentModels = computed(() => {
  const provider = selectedProvider.value;
  if (!provider) return [];
  return provider.models.filter((model) => model.enabled && model.capabilities.includes("text"));
});

const selectedProviderEnabled = computed({
  get: () => selectedProvider.value?.enabled ?? false,
  set: (enabled: boolean) => {
    updateSelectedProvider((provider) => ({ ...provider, enabled }));
  },
});

function selectProvider(providerId: string) {
  selectedProviderId.value = providerId;
  editingModelId.value = null;
  isAddingModel.value = false;
}

function updateSelectedProvider(updater: (provider: AiProviderConfig) => AiProviderConfig) {
  const provider = selectedProvider.value;
  if (!provider) return;
  patchProviderInSettings(settings.value, provider.id, updater);
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

function setAgentDefaultModel(modelId: string) {
  const provider = selectedProvider.value;
  if (!provider) return;
  settings.value.agentDefaultProviderId = provider.id;
  settings.value.agentDefaultModelId = modelId;
  updateSelectedProvider((current) => ({ ...current, defaultModelId: modelId }));
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
  const editingId = editingModelId.value;
  if (!editingId) return;
  const id = editModelDraft.value.id.trim();
  const name = editModelDraft.value.name.trim() || id;
  if (!id || editModelDraft.value.capabilities.length === 0) return;

  updateSelectedProvider((provider) => ({
    ...provider,
    models: provider.models.map((model) =>
      model.id === editingId
        ? {
            ...model,
            id,
            name,
            capabilities: [...editModelDraft.value.capabilities],
          }
        : model,
    ),
  }));
  editingModelId.value = null;
}

function removeModel(modelId: string) {
  updateSelectedProvider((provider) => ({
    ...provider,
    models: provider.models.filter((model) => model.id !== modelId),
  }));
}

function addModel() {
  const id = modelDraft.value.id.trim();
  const name = modelDraft.value.name.trim() || id;
  if (!id || modelDraft.value.capabilities.length === 0) return;
  if (selectedProvider.value?.models.some((model) => model.id === id)) return;

  updateSelectedProvider((provider) => ({
    ...provider,
    models: [
      ...provider.models,
      {
        id,
        name,
        enabled: true,
        capabilities: [...modelDraft.value.capabilities],
      },
    ],
  }));

  modelDraft.value = { id: "", name: "", capabilities: ["text"] };
  isAddingModel.value = false;
}

function toggleModelEnabled(modelId: string, enabled: boolean) {
  updateSelectedProvider((provider) => ({
    ...provider,
    models: provider.models.map((model) =>
      model.id === modelId ? { ...model, enabled } : model,
    ),
  }));
}
</script>

<template>
  <div class="ai-provider-layout">
    <aside class="provider-sidebar">
      <input
        v-model="providerSearch"
        class="setting-input"
        placeholder="搜索服务商"
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
              title="已启用"
            />
            <span class="provider-name">{{ provider.name }}</span>
          </span>
        </button>
      </div>
      <button class="ghost-btn" type="button" @click="addProvider">+ 添加自定义</button>
    </aside>

    <section v-if="selectedProvider" class="provider-detail">
      <div class="detail-header">
        <div>
          <h3 class="detail-title">{{ selectedProvider.name }}</h3>
          <p class="detail-desc">配置 API 与模型能力；Agent 默认使用已启用的文本模型。</p>
        </div>
        <div class="detail-actions">
          <label class="toggle">
            <input v-model="selectedProviderEnabled" type="checkbox" />
            <span>启用</span>
          </label>
          <button
            v-if="selectedProvider.id.startsWith('custom-provider-')"
            class="ghost-btn danger"
            type="button"
            @click="deleteProvider"
          >
            删除
          </button>
        </div>
      </div>

      <div class="detail-section">
        <label class="field">
          <span class="field-label">API 地址</span>
          <input
            :value="selectedProvider.baseUrl"
            class="setting-input"
            spellcheck="false"
            @input="updateSelectedProvider((p) => ({ ...p, baseUrl: ($event.target as HTMLInputElement).value }))"
          />
        </label>
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            :value="selectedProvider.apiKey"
            class="setting-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            @input="updateSelectedProvider((p) => ({ ...p, apiKey: ($event.target as HTMLInputElement).value }))"
          />
        </label>
        <label v-if="selectedProvider.id.startsWith('custom-provider-')" class="field">
          <span class="field-label">服务商名称</span>
          <input
            :value="selectedProvider.name"
            class="setting-input"
            spellcheck="false"
            @input="updateSelectedProvider((p) => ({ ...p, name: ($event.target as HTMLInputElement).value }))"
          />
        </label>
      </div>

      <div class="detail-section">
        <label class="field">
          <span class="field-label">Agent 默认模型</span>
          <select
            class="setting-input"
            :value="settings.agentDefaultProviderId === selectedProvider.id
              ? settings.agentDefaultModelId
              : selectedProvider.defaultModelId"
            @change="setAgentDefaultModel(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="model in enabledAgentModels"
              :key="model.id"
              :value="model.id"
            >
              {{ model.name }}
            </option>
          </select>
        </label>
      </div>

      <div class="detail-section">
        <div class="section-head">
          <span class="field-label">模型列表</span>
          <button class="ghost-btn" type="button" @click="isAddingModel = !isAddingModel">
            {{ isAddingModel ? "取消" : "+ 添加模型" }}
          </button>
        </div>

        <div v-if="isAddingModel" class="model-editor">
          <input
            v-model="modelDraft.id"
            class="setting-input"
            placeholder="模型 ID，如 gpt-4o"
            spellcheck="false"
          />
          <input
            v-model="modelDraft.name"
            class="setting-input"
            placeholder="显示名称"
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
          <button class="ghost-btn" type="button" @click="addModel">保存模型</button>
        </div>

        <div class="model-list">
          <div v-for="model in selectedProvider.models" :key="model.id" class="model-row">
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
                  <button class="ghost-btn" type="button" @click="saveEditedModel">保存</button>
                  <button class="ghost-btn" type="button" @click="editingModelId = null">取消</button>
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
                  <strong>{{ model.name }}</strong>
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
                <button class="ghost-btn" type="button" @click="startEditModel(model)">编辑</button>
                <button class="ghost-btn danger" type="button" @click="removeModel(model.id)">删除</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="detail-section web-search-section">
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">网页搜索</span>
            <span class="setting-desc">无需 API Key，Agent 可联网查资料。</span>
          </div>
          <label class="toggle">
            <input v-model="settings.webSearchEnabled" type="checkbox" />
            <span>启用</span>
          </label>
        </div>
        <label v-if="settings.webSearchEnabled" class="field">
          <span class="field-label">每次搜索条数</span>
          <input
            v-model.number="settings.webSearchMaxResults"
            class="setting-input setting-input-narrow"
            type="number"
            min="1"
            max="8"
            step="1"
          />
        </label>
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

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-desc {
  font-size: 12px;
  color: var(--ink-text-muted);
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
