import { createApp } from "vue";
import App from "./App.vue";
import { initTheme } from "./composables/useTheme";
import "katex/dist/katex.min.css";
import "./styles/global.css";

initTheme();
createApp(App).mount("#app");
