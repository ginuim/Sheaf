import { translate } from "../composables/useLocale";
import type { AiProviderConfigSeed } from "./types";

const BUILTIN_PROVIDER_NAME_KEYS: Partial<Record<string, string>> = {
  "aliyun-bailian": "aiProviders.providers.aliyun-bailian",
  mimo: "aiProviders.providers.mimo",
  "minimax-cn": "aiProviders.providers.minimax-cn",
  "minimax-global": "aiProviders.providers.minimax-global",
};

const BUILTIN_MODEL_NAME_KEYS: Partial<Record<string, Partial<Record<string, string>>>> = {
  deepseek: {
    "deepseek-chat": "aiProviders.models.deepseek.chat",
    "deepseek-reasoner": "aiProviders.models.deepseek.reasoner",
    "deepseek-v4-flash": "aiProviders.models.deepseek.v4Flash",
    "deepseek-v4-pro": "aiProviders.models.deepseek.v4",
  },
};

export const staleDefaultModelIdsByProviderId: Partial<Record<string, string[]>> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

export const defaultProviderTemplates: AiProviderConfigSeed[] = [
  {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    defaultModelId: "gpt-4o",
    enabled: false,
    id: "openai",
    name: "OpenAI",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "gpt-4o",
        name: "GPT-4o",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
      },
      {
        capabilities: ["image"],
        enabled: true,
        id: "gpt-image-1",
        name: "GPT Image 1",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModelId: "claude-sonnet-4-6",
    enabled: false,
    id: "anthropic",
    name: "Anthropic",
    apiStyle: "anthropic",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModelId: "gemini-2.5-flash",
    enabled: false,
    id: "google",
    name: "Google",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    defaultModelId: "deepseek-v4-flash",
    enabled: false,
    id: "deepseek",
    name: "DeepSeek",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
      },
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "deepseek-v4-pro",
        name: "DeepSeek V4",
      },
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "deepseek-chat",
        name: "DeepSeek Chat (deprecated 2026/07/24)",
      },
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner (deprecated 2026/07/24)",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModelId: "MiniMax-M2.7",
    enabled: false,
    id: "minimax-cn",
    name: "MiniMax (China)",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "MiniMax-M2.7",
        name: "MiniMax M2.7",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "MiniMax-VL-01",
        name: "MiniMax VL 01",
      },
      {
        capabilities: ["image"],
        enabled: true,
        id: "image-01",
        name: "Image 01",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://api.minimax.io/v1",
    defaultModelId: "MiniMax-M2.7",
    enabled: false,
    id: "minimax-global",
    name: "MiniMax (Global)",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "MiniMax-M2.7",
        name: "MiniMax M2.7",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "MiniMax-VL-01",
        name: "MiniMax VL 01",
      },
      {
        capabilities: ["image"],
        enabled: true,
        id: "image-01",
        name: "Image 01",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModelId: "qwen-plus",
    enabled: false,
    id: "aliyun-bailian",
    name: "Qwen (Alibaba Cloud)",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "qwen-plus",
        name: "Qwen Plus",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "qwen-turbo",
        name: "Qwen Turbo",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModelId: "openrouter/auto",
    enabled: false,
    id: "openrouter",
    name: "OpenRouter",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "openrouter/auto",
        name: "OpenRouter Auto",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "openai/gpt-4o",
        name: "GPT-4o",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://api.xiaomimimo.com/v1",
    defaultModelId: "mimo-v2.5-pro",
    enabled: false,
    id: "mimo",
    name: "Xiaomi MiMo",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "reasoning", "tools", "web"],
        enabled: true,
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro",
      },
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "mimo-v2.5",
        name: "MiMo V2.5",
      },
      {
        capabilities: ["text", "tools", "web"],
        enabled: true,
        id: "mimo-v2-flash",
        name: "MiMo V2 Flash",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "http://localhost:11434/v1",
    defaultModelId: "llama3.3",
    enabled: false,
    id: "ollama",
    name: "Ollama",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text"],
        enabled: true,
        id: "llama3.3",
        name: "Llama 3.3",
      },
    ],
  },
];

export function isBuiltinProvider(providerId: string) {
  return defaultProviderTemplates.some((provider) => provider.id === providerId);
}

export function localizedBuiltinProviderName(providerId: string, fallback: string) {
  const key = BUILTIN_PROVIDER_NAME_KEYS[providerId];
  return key ? translate(key) : fallback;
}

export function localizedBuiltinModelName(
  providerId: string,
  modelId: string,
  fallback: string,
) {
  const key = BUILTIN_MODEL_NAME_KEYS[providerId]?.[modelId];
  return key ? translate(key) : fallback;
}

function cloneProviderTemplate(provider: AiProviderConfigSeed): AiProviderConfigSeed {
  return {
    ...provider,
    models: provider.models.map((model) => ({
      ...model,
      name: localizedBuiltinModelName(provider.id, model.id, model.name),
    })),
    name: localizedBuiltinProviderName(provider.id, provider.name),
  };
}

export function getDefaultProviderTemplates(): AiProviderConfigSeed[] {
  return defaultProviderTemplates.map(cloneProviderTemplate);
}

export function defaultProviderTemplateForId(providerId: string) {
  return getDefaultProviderTemplates().find((provider) => provider.id === providerId);
}

export function defaultApiUrlForProvider(providerId: string) {
  return defaultProviderTemplateForId(providerId)?.baseUrl ?? "";
}

export function isMinimaxProvider(providerId: string) {
  return providerId === "minimax-cn" || providerId === "minimax-global";
}
