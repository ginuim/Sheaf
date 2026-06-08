import { createI18n } from "vue-i18n";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";

export type AppLocale = "zh-CN" | "en";

export const LOCALE_STORAGE_KEY = "blank-locale";

export function getStoredLocale(): AppLocale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en") {
    return stored;
  }

  const language = navigator.language.toLowerCase();
  return language.startsWith("zh") ? "zh-CN" : "en";
}

export function applyDocumentLocale(locale: AppLocale) {
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}

export const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: "en",
  messages: {
    "zh-CN": zhCN,
    en,
  },
});
