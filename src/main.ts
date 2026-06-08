import { createApp } from "vue";
import App from "./App.vue";
import { initLocale } from "./composables/useLocale";
import { initTheme } from "./composables/useTheme";
import { i18n } from "./i18n";
import "katex/dist/katex.min.css";
import "./styles/global.css";

initTheme();
initLocale();
createApp(App).use(i18n).mount("#app");
