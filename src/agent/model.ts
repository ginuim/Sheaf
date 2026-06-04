import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

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

export function createAgentLanguageModel(settings: AgentModelSettings): LanguageModel {
  const baseURL = normalizedBaseUrl(settings.baseUrl);
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error("请先在设置中填写 API Key");
  }

  if (usesAnthropicApi(baseURL)) {
    const provider = createAnthropic({
      apiKey,
      baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
    });
    return provider(settings.model);
  }

  const provider = createOpenAICompatible({
    name: "sheaf",
    baseURL,
    apiKey,
  });
  return provider(settings.model);
}
