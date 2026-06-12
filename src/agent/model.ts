import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { resolveAgentModel } from "../ai-providers/resolve";
import type { AiProviderSettings } from "../ai-providers/types";

export type AgentModelSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function usesAnthropicApi(baseUrl: string): boolean {
  return /anthropic\.com/i.test(baseUrl);
}

export function createAgentLanguageModel(settings: AiProviderSettings): LanguageModel {
  const resolved = resolveAgentModel(settings);
  if (!resolved) {
    throw new Error("请先在设置中启用服务商并填写 API Key");
  }

  const baseURL = normalizedBaseUrl(resolved.baseUrl);
  const apiKey = resolved.apiKey.trim();

  if (resolved.apiStyle === "anthropic" || usesAnthropicApi(baseURL)) {
    const provider = createAnthropic({
      apiKey,
      baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
    });
    return provider(resolved.model);
  }

  const provider = createOpenAICompatible({
    name: "sheaf",
    baseURL,
    apiKey,
  });
  return provider(resolved.model);
}
