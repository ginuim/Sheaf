import { modelHasCapability } from "./capabilities";
import { isBuiltinProvider, localizedBuiltinProviderName } from "./catalog";
import type {
  AiProviderConfig,
  AiProviderSettings,
  ResolvedAgentModel,
  ResolvedImageModel,
} from "./types";

function enabledProviders(settings: AiProviderSettings) {
  return settings.providers.filter((provider) => provider.enabled && provider.apiKey?.trim());
}

function resolveProvider(
  settings: AiProviderSettings,
  providerId?: string,
): AiProviderConfig | null {
  const providers = enabledProviders(settings);
  if (providers.length === 0) return null;

  if (providerId) {
    const matched = providers.find((provider) => provider.id === providerId);
    if (matched) return matched;
  }

  const defaultId = settings.agentDefaultProviderId;
  if (defaultId) {
    const matched = providers.find((provider) => provider.id === defaultId);
    if (matched) return matched;
  }

  return providers[0] ?? null;
}

function resolveTextModel(provider: AiProviderConfig, modelId?: string) {
  const enabledModels = provider.models.filter((model) => model.enabled);
  if (enabledModels.length === 0) return null;

  if (modelId) {
    const matched = enabledModels.find(
      (model) => model.id === modelId && modelHasCapability(model, "text"),
    );
    if (matched) return matched;
  }

  if (provider.defaultModelId) {
    const matched = enabledModels.find(
      (model) =>
        model.id === provider.defaultModelId && modelHasCapability(model, "text"),
    );
    if (matched) return matched;
  }

  return (
    enabledModels.find((model) => modelHasCapability(model, "text")) ??
    enabledModels[0] ??
    null
  );
}

export function resolveAgentModel(settings: AiProviderSettings): ResolvedAgentModel | null {
  const provider = resolveProvider(
    settings,
    settings.agentDefaultProviderId,
  );
  if (!provider) return null;

  const model = resolveTextModel(provider, settings.agentDefaultModelId);
  if (!model) return null;

  const apiKey = provider.apiKey?.trim() ?? "";
  const baseUrl = provider.baseUrl?.trim() ?? "";
  if (!apiKey || !baseUrl) return null;

  return {
    providerId: provider.id,
    providerName: isBuiltinProvider(provider.id)
      ? localizedBuiltinProviderName(provider.id, provider.name)
      : provider.name,
    baseUrl,
    apiKey,
    model: model.id,
    apiStyle: provider.apiStyle,
  };
}

function resolveImageModelInProvider(provider: AiProviderConfig): ResolvedImageModel | null {
  const apiKey = provider.apiKey?.trim() ?? "";
  const baseUrl = provider.baseUrl?.trim() ?? "";
  if (!apiKey || !baseUrl) return null;

  const imageModel = provider.models.find(
    (model) => model.enabled && modelHasCapability(model, "image"),
  );
  if (!imageModel) return null;

  return {
    providerId: provider.id,
    baseUrl,
    apiKey,
    model: imageModel.id,
  };
}

export function resolveImageModel(settings: AiProviderSettings): ResolvedImageModel | null {
  const providers = enabledProviders(settings);
  if (providers.length === 0) return null;

  const preferredProviderId = settings.agentDefaultProviderId;
  if (preferredProviderId) {
    const preferred = providers.find((provider) => provider.id === preferredProviderId);
    if (preferred) {
      const resolved = resolveImageModelInProvider(preferred);
      if (resolved) return resolved;
    }
  }

  for (const provider of providers) {
    const resolved = resolveImageModelInProvider(provider);
    if (resolved) return resolved;
  }

  return null;
}

export function hasImageGeneration(settings: AiProviderSettings) {
  return resolveImageModel(settings) !== null;
}
