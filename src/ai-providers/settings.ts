import {
  defaultApiUrlForProvider,
  defaultProviderTemplateForId,
  getDefaultProviderTemplates,
} from "./catalog";
import { readModelCapabilities } from "./capabilities";
import type {
  AiProviderConfig,
  AiProviderConfigSeed,
  AiProviderModel,
  AiProviderModelSeed,
  AiProviderSettings,
} from "./types";

const SETTINGS_KEY = "blank.ai-settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createDefaultAiSettings(): AiProviderSettings {
  return {
    agentDefaultModelId: "gpt-4o",
    agentDefaultProviderId: "openai",
    providers: getDefaultProviderTemplates().map(cloneProvider),
    webSearchEnabled: true,
    webSearchMaxResults: 4,
  };
}

export function createCustomAiProvider(index: number): AiProviderConfig {
  const providerNumber = Math.max(1, index);
  return {
    apiKey: "",
    baseUrl: "",
    defaultModelId: "default",
    enabled: false,
    id: `custom-provider-${providerNumber}`,
    models: [
      { capabilities: ["text"], enabled: true, id: "default", name: "Default model" },
    ],
    name: "自定义服务商",
    apiStyle: "openai-compatible",
  };
}

export function normalizeAiSettings(value: unknown): AiProviderSettings {
  if (!isRecord(value)) return createDefaultAiSettings();

  if (Array.isArray(value.providers)) {
    const providers = mergeMissingBuiltinProviders(
      value.providers
        .map(normalizeProvider)
        .filter((provider): provider is AiProviderConfig => Boolean(provider)),
    );
    if (providers.length === 0) return createDefaultAiSettings();

    const agentDefaultProviderId = resolveProviderId(
      providers,
      value.agentDefaultProviderId,
    );
    const selectedProvider =
      providers.find((provider) => provider.id === agentDefaultProviderId) ??
      providers[0];
    const storedModelId =
      typeof value.agentDefaultModelId === "string" ? value.agentDefaultModelId : "";
    const agentDefaultModelId = resolveAgentDefaultModelId(
      selectedProvider,
      storedModelId,
    );

    const maxResults =
      typeof value.webSearchMaxResults === "number" && value.webSearchMaxResults >= 1
        ? Math.min(8, Math.floor(value.webSearchMaxResults))
        : 4;

    return {
      agentDefaultModelId,
      agentDefaultProviderId,
      providers,
      webSearchEnabled:
        typeof value.webSearchEnabled === "boolean" ? value.webSearchEnabled : true,
      webSearchMaxResults: maxResults,
    };
  }

  return migrateLegacyFlatSettings(value);
}

function migrateLegacyFlatSettings(value: Record<string, unknown>): AiProviderSettings {
  const baseUrl =
    typeof value.baseUrl === "string" && value.baseUrl.trim()
      ? value.baseUrl.trim()
      : "https://api.openai.com/v1";
  const apiKey = typeof value.apiKey === "string" ? value.apiKey : "";
  const model =
    typeof value.model === "string" && value.model.trim() ? value.model.trim() : "gpt-4o";
  const maxResults =
    typeof value.webSearchMaxResults === "number" && value.webSearchMaxResults >= 1
      ? Math.min(8, Math.floor(value.webSearchMaxResults))
      : 4;

  const defaults = createDefaultAiSettings();
  const legacyProvider: AiProviderConfig = {
    apiKey,
    baseUrl,
    defaultModelId: model,
    enabled: Boolean(apiKey.trim()),
    id: "legacy-migrated",
    name: "已迁移配置",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: model,
        name: model,
      },
    ],
  };

  return {
    ...defaults,
    agentDefaultProviderId: legacyProvider.id,
    agentDefaultModelId: model,
    providers: [legacyProvider, ...defaults.providers],
    webSearchEnabled:
      typeof value.webSearchEnabled === "boolean" ? value.webSearchEnabled : true,
    webSearchMaxResults: maxResults,
  };
}

function normalizeProvider(value: unknown): AiProviderConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  const providerId = value.id;
  const defaultProvider = defaultProviderTemplateForId(providerId);
  const apiStyle =
    value.apiStyle === "anthropic" ||
    value.apiStyle === "openai-compatible" ||
    value.apiStyle === "openai-responses"
      ? value.apiStyle
      : defaultProvider?.apiStyle ?? "openai-compatible";

  const normalizedStoredModels = Array.isArray(value.models)
    ? value.models
        .map(normalizeModel)
        .filter((model): model is AiProviderModel => Boolean(model))
    : [];
  const models = mergeBuiltinProviderModels(
    providerId,
    normalizedStoredModels.length > 0
      ? normalizedStoredModels
      : defaultProvider?.models.map(cloneModel) ?? [
          { capabilities: ["text"], enabled: true, id: "default", name: "Default model" },
        ],
  );

  const storedDefaultModelId =
    typeof value.defaultModelId === "string" ? value.defaultModelId : "";
  const defaultModelId =
    models.some((model) => model.id === storedDefaultModelId)
      ? storedDefaultModelId
      : defaultProvider?.defaultModelId &&
          models.some((model) => model.id === defaultProvider.defaultModelId)
        ? defaultProvider.defaultModelId
        : models[0]?.id;

  const storedBaseUrl = typeof value.baseUrl === "string" ? value.baseUrl : "";

  const apiKey = typeof value.apiKey === "string" ? value.apiKey : "";

  return {
    apiKey,
    baseUrl: storedBaseUrl || defaultApiUrlForProvider(providerId),
    ...(typeof value.customHeaders === "string" && value.customHeaders.trim()
      ? { customHeaders: value.customHeaders }
      : {}),
    defaultModelId,
    enabled: value.enabled === true && Boolean(apiKey.trim()),
    id: providerId,
    models,
    name: value.name,
    apiStyle,
  };
}

function normalizeModel(value: unknown): AiProviderModel | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    capabilities: readModelCapabilities(value),
    enabled: value.enabled !== false,
    id: value.id,
    name: value.name,
  };
}

function resolveProviderId(providers: AiProviderConfig[], stored?: unknown) {
  if (
    typeof stored === "string" &&
    providers.some((provider) => provider.id === stored && provider.enabled)
  ) {
    return stored;
  }
  const enabled = providers.find((provider) => provider.enabled);
  return enabled?.id ?? providers[0]?.id;
}

function resolveDefaultTextModelId(provider?: AiProviderConfig) {
  if (!provider) return undefined;
  const enabledModels = provider.models.filter((model) => model.enabled);
  const textModel = enabledModels.find((model) => model.capabilities.includes("text"));
  return textModel?.id ?? enabledModels[0]?.id ?? provider.defaultModelId;
}

function resolveAgentDefaultModelId(provider: AiProviderConfig | undefined, storedModelId: string) {
  if (!provider) return undefined;
  if (
    storedModelId &&
    provider.models.some((model) => model.id === storedModelId && model.enabled)
  ) {
    return storedModelId;
  }
  return resolveDefaultTextModelId(provider);
}

function mergeBuiltinProviderModels(
  providerId: string,
  storedModels: AiProviderModel[],
): AiProviderModel[] {
  const template = defaultProviderTemplateForId(providerId);
  if (!template || providerId.startsWith("custom-provider-")) return storedModels;

  const storedIds = new Set(storedModels.map((model) => model.id));
  const missing = template.models.filter((model) => !storedIds.has(model.id));
  if (missing.length === 0) return storedModels;

  const merged = [...storedModels, ...missing.map(cloneModel)];
  const order = new Map(template.models.map((model, index) => [model.id, index]));
  merged.sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99));
  return merged;
}

function cloneProvider(provider: AiProviderConfigSeed): AiProviderConfig {
  return {
    ...provider,
    models: provider.models.map(cloneModel),
  };
}

function cloneModel(model: AiProviderModelSeed): AiProviderModel {
  return {
    capabilities: readModelCapabilities(model),
    enabled: model.enabled,
    id: model.id,
    name: model.name,
  };
}

export function loadAiSettings(): AiProviderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createDefaultAiSettings();
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return createDefaultAiSettings();
  }
}

export function saveAiSettings(settings: AiProviderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export type { AiProviderSettings } from "./types";

export function updateProviderInSettings(
  settings: AiProviderSettings,
  providerId: string,
  updater: (provider: AiProviderConfig) => AiProviderConfig,
): AiProviderSettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) =>
      provider.id === providerId ? updater(provider) : provider,
    ),
  };
}

/** 就地更新 provider，保持与 useAI 的 reactive 引用联动。 */
export function patchProviderInSettings(
  settings: AiProviderSettings,
  providerId: string,
  updater: (provider: AiProviderConfig) => AiProviderConfig,
) {
  const index = settings.providers.findIndex((provider) => provider.id === providerId);
  if (index < 0) return;
  settings.providers[index] = updater(settings.providers[index]);
}

function mergeMissingBuiltinProviders(providers: AiProviderConfig[]) {
  const existingIds = new Set(providers.map((provider) => provider.id));
  const missing = getDefaultProviderTemplates()
    .filter((template) => !existingIds.has(template.id))
    .map(cloneProvider);
  return missing.length > 0 ? [...providers, ...missing] : providers;
}
