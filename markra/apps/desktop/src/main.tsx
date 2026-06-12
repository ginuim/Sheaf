import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { configureAppRuntime } from "@markra/app";
import "@markra/app/styles.css";
import { desktopRuntime } from "./runtime";

configureAppRuntime(desktopRuntime);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
