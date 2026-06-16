import {
  markdownFormatToolIds,
  type MarkdownFormatToolId,
} from "../types/markdown-format";

const STORAGE_KEY = "sheaf-app-preferences";

export type AppPreferences = {
  autoUpdateEnabled: boolean;
  markdownFormatBarEnabled: boolean;
  markdownFormatBarTools: Record<MarkdownFormatToolId, boolean>;
  markdownFormatBarToolOrder: MarkdownFormatToolId[];
};

const disabledByDefaultTools: MarkdownFormatToolId[] = [
  "heading4",
  "inlineCode",
  "codeBlock",
  "table",
];

function createDefaultFormatBarTools(): Record<MarkdownFormatToolId, boolean> {
  return Object.fromEntries(
    markdownFormatToolIds.map((id) => [id, !disabledByDefaultTools.includes(id)]),
  ) as Record<MarkdownFormatToolId, boolean>;
}

const defaults: AppPreferences = {
  autoUpdateEnabled: true,
  markdownFormatBarEnabled: true,
  markdownFormatBarTools: createDefaultFormatBarTools(),
  markdownFormatBarToolOrder: [...markdownFormatToolIds],
};

function defaultPreferences(): AppPreferences {
  return {
    autoUpdateEnabled: defaults.autoUpdateEnabled,
    markdownFormatBarEnabled: defaults.markdownFormatBarEnabled,
    markdownFormatBarTools: { ...defaults.markdownFormatBarTools },
    markdownFormatBarToolOrder: [...defaults.markdownFormatBarToolOrder],
  };
}

function normalizeFormatBarTools(
  value: unknown,
): Record<MarkdownFormatToolId, boolean> {
  const source = value && typeof value === "object"
    ? value as Partial<Record<MarkdownFormatToolId, unknown>>
    : {};

  return Object.fromEntries(
    markdownFormatToolIds.map((id) => [
      id,
      typeof source[id] === "boolean" ? source[id] : defaults.markdownFormatBarTools[id],
    ]),
  ) as Record<MarkdownFormatToolId, boolean>;
}

function normalizeFormatBarToolOrder(value: unknown): MarkdownFormatToolId[] {
  if (!Array.isArray(value)) {
    return [...markdownFormatToolIds];
  }

  const validIds = value.filter((id): id is MarkdownFormatToolId =>
    markdownFormatToolIds.includes(id as any)
  );

  const missingIds = markdownFormatToolIds.filter(id => !validIds.includes(id));

  return [...validIds, ...missingIds];
}

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences();
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      autoUpdateEnabled:
        typeof parsed.autoUpdateEnabled === "boolean"
          ? parsed.autoUpdateEnabled
          : defaults.autoUpdateEnabled,
      markdownFormatBarEnabled:
        typeof parsed.markdownFormatBarEnabled === "boolean"
          ? parsed.markdownFormatBarEnabled
          : defaults.markdownFormatBarEnabled,
      markdownFormatBarTools: normalizeFormatBarTools(parsed.markdownFormatBarTools),
      markdownFormatBarToolOrder: normalizeFormatBarToolOrder(parsed.markdownFormatBarToolOrder),
    };
  } catch {
    return defaultPreferences();
  }
}

export function saveAppPreferences(preferences: AppPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
