import { createI18n } from "vue-i18n";
import {
  getLocaleFromReaideaCookie,
  localeFromNavigator,
} from "../shared/reaideaCookies";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";

export type AppLocale = "zh-CN" | "en";

export const LOCALE_STORAGE_KEY = "blank-locale";

export function getStoredLocale(): AppLocale {
  const fromCookie = getLocaleFromReaideaCookie();
  if (fromCookie) {
    return fromCookie;
  }

  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en") {
    return stored;
  }

  return localeFromNavigator();
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
