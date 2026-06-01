<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ABOUT_INFO, BLOG_ABOUT_URL } from "../composables/useAbout";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const APP_VERSION = "0.1.0";

async function openBlog() {
  if (isTauri()) {
    await openUrl(BLOG_ABOUT_URL);
  } else {
    window.open(BLOG_ABOUT_URL, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="about-overlay" @click.self="emit('close')">
      <div
        class="about-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <header class="about-header">
          <div class="about-brand">
            <h2 id="about-title" class="about-app-name">Sheaf</h2>
            <span class="about-version">版本 {{ APP_VERSION }}</span>
          </div>
          <button class="about-close" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="about-body">
          <div class="about-author">
            <div>
              <h3 class="about-name">{{ ABOUT_INFO.name }}</h3>
              <span class="about-role">{{ ABOUT_INFO.role }}</span>
            </div>
          </div>

          <div class="about-bio">
            <p v-for="(paragraph, index) in ABOUT_INFO.bio" :key="index">
              {{ paragraph }}
            </p>
          </div>
        </div>

        <footer class="about-footer">
          <button class="about-blog-link" @click="openBlog">
            访问 reaidea.com
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(2px);
  -webkit-app-region: no-drag;
}

.about-window {
  width: min(520px, calc(100vw - 48px));
  max-height: min(640px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border-strong);
  border-radius: 12px;
  box-shadow:
    0 24px 48px var(--ink-shadow),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.about-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--ink-border);
}

.about-brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.about-app-name {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.about-version {
  font-size: 12px;
  color: var(--ink-text-muted);
}

.about-close {
  width: 28px;
  height: 28px;
  font-size: 20px;
  line-height: 1;
  color: var(--ink-text-muted);
  border-radius: 6px;
  transition:
    background 0.15s,
    color 0.15s;
}

.about-close:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.about-body {
  flex: 1;
  padding: 20px 24px;
  overflow: auto;
}

.about-author {
  margin-bottom: 16px;
}

.about-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.about-role {
  font-size: 12px;
  color: var(--ink-text-muted);
}

.about-bio p {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-text);
  margin-bottom: 12px;
}

.about-bio p:last-child {
  margin-bottom: 0;
}

.about-footer {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--ink-border);
}

.about-blog-link {
  width: 100%;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-text);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border-strong);
  border-radius: 8px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.about-blog-link:hover {
  background: var(--ink-accent-soft);
  border-color: var(--ink-accent);
}
</style>
