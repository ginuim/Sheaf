import { createApp } from "vue";
import "../styles/global.css";
import "./landing.css";
import LandingApp from "./LandingApp.vue";

const app = createApp(LandingApp);
app.mount("#app");
