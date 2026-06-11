export const REAIDEA_LANG_COOKIE = "reaidea_lang";
export const REAIDEA_THEME_COOKIE = "reaidea_theme";

export type ReaideaLang = "zh" | "en";
export type ReaideaTheme = "light" | "dark";

export function readCookie(name: string): string | null {
  const cookie = `; ${document.cookie}`;
  const parts = cookie.split(`; ${name}=`);
  if (parts.length !== 2) {
    return null;
  }
  return decodeURIComponent(parts.pop()!.split(";").shift()!);
}

export function createReaideaCookieAttrs(): string[] {
  const attrs = ["path=/", "max-age=31536000", "SameSite=Lax"];
  if (
    location.hostname === "reaidea.com" ||
    location.hostname.endsWith(".reaidea.com")
  ) {
    attrs.push("Domain=.reaidea.com");
  }
  return attrs;
}

export function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; ${createReaideaCookieAttrs().join("; ")}`;
}

export function reaideaLangToAppLocale(lang: string): "zh-CN" | "en" | null {
  if (lang === "zh") {
    return "zh-CN";
  }
  if (lang === "en") {
    return "en";
  }
  return null;
}

export function appLocaleToReaideaLang(locale: "zh-CN" | "en"): ReaideaLang {
  return locale === "zh-CN" ? "zh" : "en";
}

export function getLocaleFromReaideaCookie(): "zh-CN" | "en" | null {
  const lang = readCookie(REAIDEA_LANG_COOKIE);
  if (!lang) {
    return null;
  }
  return reaideaLangToAppLocale(lang);
}

export function setReaideaLangCookie(locale: "zh-CN" | "en") {
  writeCookie(REAIDEA_LANG_COOKIE, appLocaleToReaideaLang(locale));
}

export function localeFromNavigator(): "zh-CN" | "en" {
  const language = navigator.language.toLowerCase();
  return language.startsWith("zh") ? "zh-CN" : "en";
}
