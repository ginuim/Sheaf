import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  applyDocumentLocale,
  getStoredLocale,
  i18n,
  LOCALE_STORAGE_KEY,
  type AppLocale,
} from "../i18n";

const locale = ref<AppLocale>(getStoredLocale());

watch(
  locale,
  (value) => {
    i18n.global.locale.value = value;
    localStorage.setItem(LOCALE_STORAGE_KEY, value);
    applyDocumentLocale(value);
  },
  { immediate: true },
);

export function initLocale() {
  applyDocumentLocale(locale.value);
}

export function useLocale() {
  const { t, tm } = useI18n();

  function setLocale(value: AppLocale) {
    locale.value = value;
  }

  return { locale, setLocale, t, tm };
}

export function translate(key: string, params?: Record<string, unknown>) {
  return i18n.global.t(key, params ?? {});
}
