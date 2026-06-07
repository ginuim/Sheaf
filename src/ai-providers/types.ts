export const aiModelCapabilities = [
  "text",
  "vision",
  "image",
  "reasoning",
  "tools",
  "web",
] as const;

export type AiModelCapability = (typeof aiModelCapabilities)[number];

export type AiProviderRequestStyle =
  | "openai-compatible"
  | "openai-responses"
  | "anthropic";

export type AiProviderModel = {
  capabilities: AiModelCapability[];
  enabled: boolean;
  id: string;
  name: string;
};

export type AiProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  customHeaders?: string;
  defaultModelId?: string;
  enabled: boolean;
  id: string;
  models: AiProviderModel[];
  name: string;
  apiStyle?: AiProviderRequestStyle;
};

export type AiProviderModelSeed = Omit<AiProviderModel, "capabilities"> & {
  capability?: AiModelCapability;
  capabilities?: AiModelCapability[];
};

export type AiProviderConfigSeed = Omit<AiProviderConfig, "models"> & {
  models: AiProviderModelSeed[];
};

export type AiProviderSettings = {
  agentDefaultModelId?: string;
  agentDefaultProviderId?: string;
  providers: AiProviderConfig[];
  webSearchEnabled: boolean;
  webSearchMaxResults: number;
};

export type ResolvedAgentModel = {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiStyle?: AiProviderRequestStyle;
};

export type ResolvedImageModel = {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};
