import { setTheme as setAppTheme } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { computed, ref, watch } from "vue";

const STORAGE_KEY = "blank-theme";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }
  return "system";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

const preference = ref<ThemePreference>(getStoredPreference());
const systemTheme = ref<Theme>(getSystemTheme());
const theme = computed<Theme>(() =>
  preference.value === "system" ? systemTheme.value : preference.value
);

let systemListenerAttached = false;

function syncWindowTheme(theme: Theme) {
  if (!isTauri()) return;

  void setAppTheme(theme).catch((error) => {
    console.warn("Failed to sync Tauri window theme:", error);
  });
}

function attachSystemListener() {
  if (systemListenerAttached) return;
  systemListenerAttached = true;

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      systemTheme.value = getSystemTheme();
    });
}

watch(
  theme,
  (value) => {
    applyTheme(value);
    syncWindowTheme(value);
  },
);

watch(preference, (value) => {
  localStorage.setItem(STORAGE_KEY, value);
});

export function initTheme() {
  applyTheme(theme.value);
  syncWindowTheme(theme.value);
  attachSystemListener();
}

export function useTheme() {
  attachSystemListener();

  function setPreference(value: ThemePreference) {
    preference.value = value;
  }

  function toggleTheme() {
    preference.value = theme.value === "light" ? "dark" : "light";
  }

  return { theme, preference, setPreference, toggleTheme };
}
