import { aiModelCapabilities } from "./types";
import type { AiModelCapability, AiProviderModel, AiProviderModelSeed } from "./types";

export { aiModelCapabilities };

const capabilityOrder: AiModelCapability[] = [
  "text",
  "vision",
  "image",
  "reasoning",
  "tools",
  "web",
];

export function isAiModelCapability(value: unknown): value is AiModelCapability {
  return (
    value === "image" ||
    value === "reasoning" ||
    value === "text" ||
    value === "tools" ||
    value === "vision" ||
    value === "web"
  );
}

export function readModelCapabilities(
  value: Record<string, unknown> | AiProviderModelSeed,
): AiModelCapability[] {
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  const legacy = isAiModelCapability(value.capability) ? [value.capability] : [];
  return normalizeAiModelCapabilities(capabilities.length > 0 ? capabilities : legacy);
}

export function normalizeAiModelCapabilities(
  values: readonly unknown[],
  fallback: AiModelCapability[] = ["text"],
): AiModelCapability[] {
  const selected = new Set<AiModelCapability>();
  for (const value of values) {
    if (isAiModelCapability(value)) selected.add(value);
  }
  if (selected.has("vision")) selected.add("text");
  if (selected.size === 0) {
    for (const capability of fallback) selected.add(capability);
  }
  return capabilityOrder.filter((capability) => selected.has(capability));
}

export function modelHasCapability(
  model: AiProviderModel,
  capability: AiModelCapability,
): boolean {
  return model.enabled && model.capabilities.includes(capability);
}

export function toggleModelCapability(
  capabilities: AiModelCapability[],
  capability: AiModelCapability,
): AiModelCapability[] {
  if (capabilities.includes(capability)) {
    return capabilities.filter((item) => item !== capability);
  }
  return capabilityOrder.filter(
    (item) => item === capability || capabilities.includes(item),
  );
}
