import type { AiProviderConfigSeed } from "./types";

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
    defaultModelId: "deepseek-chat",
    enabled: false,
    id: "deepseek",
    name: "DeepSeek",
    apiStyle: "openai-compatible",
    models: [
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "deepseek-chat",
        name: "DeepSeek Chat",
      },
      {
        capabilities: ["text", "reasoning", "tools"],
        enabled: true,
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
      },
    ],
  },
  {
    apiKey: "",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModelId: "MiniMax-M2.7",
    enabled: false,
    id: "minimax-cn",
    name: "MiniMax（国内）",
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
    name: "MiniMax（国际）",
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
    name: "通义千问",
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

export function defaultProviderTemplateForId(providerId: string) {
  return defaultProviderTemplates.find((provider) => provider.id === providerId);
}

export function defaultApiUrlForProvider(providerId: string) {
  return defaultProviderTemplateForId(providerId)?.baseUrl ?? "";
}

export function isMinimaxProvider(providerId: string) {
  return providerId === "minimax-cn" || providerId === "minimax-global";
}
