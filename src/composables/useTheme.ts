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

function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? getSystemTheme() : preference;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

const preference = ref<ThemePreference>(getStoredPreference());
const theme = computed<Theme>(() => resolveTheme(preference.value));

let systemListenerAttached = false;

function attachSystemListener() {
  if (systemListenerAttached) return;
  systemListenerAttached = true;

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (preference.value === "system") {
        applyTheme(getSystemTheme());
      }
    });
}

watch(
  preference,
  (value) => {
    applyTheme(resolveTheme(value));
    localStorage.setItem(STORAGE_KEY, value);
  },
  { immediate: true },
);

export function initTheme() {
  applyTheme(resolveTheme(preference.value));
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
