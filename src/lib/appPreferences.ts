const STORAGE_KEY = "sheaf-app-preferences";

export type AppPreferences = {
  autoUpdateEnabled: boolean;
};

const defaults: AppPreferences = {
  autoUpdateEnabled: true,
};

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      autoUpdateEnabled:
        typeof parsed.autoUpdateEnabled === "boolean"
          ? parsed.autoUpdateEnabled
          : defaults.autoUpdateEnabled,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveAppPreferences(preferences: AppPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
