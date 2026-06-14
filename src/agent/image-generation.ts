import { createAiFetch } from "./ai-transport";
import { isMinimaxProvider } from "../ai-providers/catalog";
import { translate } from "../composables/useLocale";
import type { ResolvedImageModel } from "../ai-providers/types";

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: string;
};

function minimaxApiHost(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return trimmed.slice(0, -3);
  return trimmed;
}

function openAiCompatibleBase(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function decodeBase64Image(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(translate("imageGeneration.downloadFailed", { status: response.status }));
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function generateMinimaxImage(
  config: ResolvedImageModel,
  prompt: string,
  aspectRatio?: string,
): Promise<GeneratedImage> {
  const host = minimaxApiHost(config.baseUrl);
  const response = await createAiFetch()(`${host}/v1/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      aspect_ratio: aspectRatio ?? "1:1",
      response_format: "base64",
      n: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      translate("imageGeneration.minimaxFailed", { status: response.status, detail: errText }),
    );
  }

  const body = (await response.json()) as {
    data?: { image_base64?: string[] };
    base_resp?: { status_msg?: string };
  };

  const base64 = body.data?.image_base64?.[0];
  if (!base64) {
    const message = body.base_resp?.status_msg ?? translate("imageGeneration.minimaxNoData");
    throw new Error(translate("imageGeneration.minimaxFailedMessage", { message }));
  }

  return { bytes: decodeBase64Image(base64), mimeType: "image/png" };
}

async function generateOpenAiCompatibleImage(
  config: ResolvedImageModel,
  prompt: string,
  aspectRatio?: string,
): Promise<GeneratedImage> {
  const base = openAiCompatibleBase(config.baseUrl);
  const size = aspectRatioToOpenAiSize(aspectRatio);
  const response = await createAiFetch()(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      n: 1,
      size,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      translate("imageGeneration.generateFailed", { status: response.status, detail: errText }),
    );
  }

  const body = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = body.data?.[0];
  if (!item) throw new Error(translate("imageGeneration.apiNoImage"));

  if (item.b64_json) {
    return { bytes: decodeBase64Image(item.b64_json), mimeType: "image/png" };
  }
  if (item.url) {
    return { bytes: await fetchImageBytes(item.url), mimeType: "image/png" };
  }

  throw new Error(translate("imageGeneration.apiUnknownFormat"));
}

function aspectRatioToOpenAiSize(aspectRatio?: string) {
  switch (aspectRatio) {
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "4:3":
    case "3:4":
      return "1024x1024";
    default:
      return "1024x1024";
  }
}

export async function generateImageFromConfig(
  config: ResolvedImageModel,
  prompt: string,
  options?: { aspectRatio?: string },
): Promise<GeneratedImage> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) throw new Error(translate("imageGeneration.emptyPrompt"));

  if (isMinimaxProvider(config.providerId)) {
    return generateMinimaxImage(config, trimmedPrompt, options?.aspectRatio);
  }

  return generateOpenAiCompatibleImage(config, trimmedPrompt, options?.aspectRatio);
}
