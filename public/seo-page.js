(function () {
  function readCookie(name) {
    var cookie = "; " + document.cookie;
    var parts = cookie.split("; " + name + "=");
    if (parts.length !== 2) return null;
    return decodeURIComponent(parts.pop().split(";").shift());
  }

  function writeCookie(value) {
    document.cookie = "reaidea_lang=" + encodeURIComponent(value) + "; path=/; max-age=31536000; SameSite=Lax";
  }

  function getInitialLocale() {
    var params = new URLSearchParams(window.location.search);
    var queryLang = params.get("lang");
    if (queryLang === "en" || queryLang === "zh-CN") return queryLang;
    var cookieLang = readCookie("reaidea_lang");
    if (cookieLang === "en" || cookieLang === "zh-CN") return cookieLang;
    if (cookieLang === "zh") return "zh-CN";
    return (navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh-CN" : "en";
  }

  function textFor(locale, zh, en) {
    return locale === "en" ? en || zh : zh || en;
  }

  function applyLocale(locale) {
    document.documentElement.lang = locale;
    document.querySelectorAll("[data-seo-locale]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-seo-locale") === locale ? "true" : "false");
    });

    var page = document.body;
    var title = textFor(locale, page.getAttribute("data-title-zh"), page.getAttribute("data-title-en"));
    var description = textFor(locale, page.getAttribute("data-description-zh"), page.getAttribute("data-description-en"));
    if (title) document.title = title;
    var metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && description) metaDescription.setAttribute("content", description);
  }

  var initialLocale = getInitialLocale();
  applyLocale(initialLocale);

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) return;
    var button = target.closest("[data-seo-locale]");
    if (!button) return;
    var locale = button.getAttribute("data-seo-locale");
    if (locale !== "en" && locale !== "zh-CN") return;
    writeCookie(locale);
    applyLocale(locale);
  });
})();
