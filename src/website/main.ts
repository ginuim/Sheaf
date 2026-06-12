import { createApp } from "vue";
import { initLocale } from "../composables/useLocale";
import { i18n } from "../i18n";
import "../styles/global.css";
import "./landing.css";
import LandingApp from "./LandingApp.vue";

initLocale();
createApp(LandingApp).use(i18n).mount("#app");
