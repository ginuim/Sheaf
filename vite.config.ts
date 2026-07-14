import { resolve, join } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import dotenv from "dotenv";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// 仅官网构建（build:website）走 R2 CDN；Tauri 的 pnpm build 保持 base=/
// @ts-expect-error process is a nodejs global
const isWebsiteBuild = process.env.WEBSITE_BUILD === "1";
if (isWebsiteBuild) {
  dotenv.config({ path: join(__dirname, ".env") });
}

// @ts-expect-error process is a nodejs global
const r2PublicBase = isWebsiteBuild
  ? process.env.R2_PUBLIC_BASE?.trim().replace(/\/+$/, "")
  : "";

const websiteInputs = {
  website: resolve(__dirname, "website.html"),
  websiteArticles: resolve(__dirname, "articles.html"),
  websiteDownload: resolve(__dirname, "download.html"),
  websiteDocs: resolve(__dirname, "docs.html"),
  websiteWechat: resolve(__dirname, "markdown-to-wechat.html"),
  websiteLocalFirst: resolve(__dirname, "local-first-ai-markdown-editor.html"),
  websiteCompare: resolve(__dirname, "sheaf-vs-typora-obsidian.html"),
};

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: r2PublicBase ? `${r2PublicBase}/` : "/",
  plugins: [vue()],

  build: {
    rollupOptions: {
      // 官网部署不打包 Tauri 应用，避免编辑器依赖被 hoist 进首屏 shared chunk
      input: isWebsiteBuild
        ? websiteInputs
        : { app: resolve(__dirname, "index.html"), ...websiteInputs },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
