import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { resolveAgentModel } from "../ai-providers/resolve";
import type { AiProviderSettings } from "../ai-providers/types";
import { createAiFetch } from "./ai-transport";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** 部分 OpenAI-compatible 中转把 reasoning_content 命名为 thinking。 */
function normalizeThinkingDataLine(line: string): string {
  const match = /^(\s*data:\s*)(.*?)(\r?)$/.exec(line);
  if (!match || match[2] === "[DONE]") return line;

  try {
    const payload = JSON.parse(match[2]) as unknown;
    const choices = asRecord(payload)?.choices;
    if (!Array.isArray(choices)) return line;
    let changed = false;

    for (const choice of choices) {
      const record = asRecord(choice);
      for (const key of ["delta", "message"]) {
        const content = asRecord(record?.[key]);
        if (
          typeof content?.thinking === "string" &&
          typeof content.reasoning_content !== "string" &&
          typeof content.reasoning !== "string"
        ) {
          content.reasoning_content = content.thinking;
          changed = true;
        }
      }
    }

    return changed ? `${match[1]}${JSON.stringify(payload)}${match[3]}` : line;
  } catch {
    return line;
  }
}

function normalizeCompatibleReasoningResponse(response: Response): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer) controller.enqueue(encoder.encode(normalizeThinkingDataLine(buffer)));
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        if (lines.length) {
          controller.enqueue(
            encoder.encode(`${lines.map(normalizeThinkingDataLine).join("\n")}\n`),
          );
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function createAgentLanguageModel(settings: AiProviderSettings): LanguageModel {
  const resolved = resolveAgentModel(settings);
  if (!resolved) {
    throw new Error("请先在设置中启用服务商并填写 API Key");
  }

  const baseURL = normalizedBaseUrl(resolved.baseUrl);
  const apiKey = resolved.apiKey.trim();
  const rawFetch = createAiFetch();

  if (resolved.apiStyle === "anthropic" || usesAnthropicApi(baseURL)) {
    const provider = createAnthropic({
      apiKey,
      baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
      fetch: rawFetch,
    });
    return provider(resolved.model);
  }

  const provider = createOpenAICompatible({
    name: "sheaf",
    baseURL,
    apiKey,
    fetch: async (request, init) =>
      normalizeCompatibleReasoningResponse(await rawFetch(request, init)),
  });
  return provider(resolved.model);
}

export function selectedModelSupportsReasoning(settings: AiProviderSettings) {
  const resolved = resolveAgentModel(settings);
  if (!resolved) return false;
  return Boolean(
    settings.providers
      .find((provider) => provider.id === resolved.providerId)
      ?.models.find((candidate) => candidate.id === resolved.model)
      ?.capabilities.includes("reasoning"),
  );
}

/** 为原生支持可见推理的服务商开启推理流；兼容接口通常会自行返回 reasoning_content。 */
export function createReasoningProviderOptions(settings: AiProviderSettings) {
  const resolved = resolveAgentModel(settings);
  if (resolved?.apiStyle !== "anthropic") return undefined;
  if (!selectedModelSupportsReasoning(settings)) return undefined;

  return {
    anthropic: {
      thinking: /(?:sonnet|opus)-4-[67]/i.test(resolved.model)
        ? { type: "adaptive" as const, display: "summarized" as const }
        : { type: "enabled" as const, budgetTokens: 1024 },
    },
  };
}
