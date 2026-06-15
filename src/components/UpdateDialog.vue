<script setup lang="ts">
import { useLocale } from "../composables/useLocale";

defineProps<{
  open: boolean;
  version: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const { t } = useLocale();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="update-overlay" @click.self="emit('cancel')">
      <div
        class="update-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
      >
        <header class="update-header">
          <h2 id="update-title" class="update-title">{{ t("app.updateAvailableTitle") }}</h2>
          <p class="update-message">
            {{ t("app.updateAvailableMessage", { version }) }}
          </p>
        </header>

        <footer class="update-footer">
          <button class="update-btn update-btn-secondary" type="button" @click="emit('cancel')">
            {{ t("app.updateLater") }}
          </button>
          <button class="update-btn update-btn-primary" type="button" @click="emit('confirm')">
            {{ t("app.updateInstallNow") }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(2px);
  -webkit-app-region: no-drag;
}

.update-window {
  width: min(420px, calc(100vw - 48px));
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

.update-header {
  padding: 20px 24px 0;
}

.update-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.update-message {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-text-muted);
}

.update-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px 24px;
}

.update-btn {
  min-width: 96px;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.update-btn-secondary {
  color: var(--ink-text);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border-strong);
}

.update-btn-secondary:hover {
  background: var(--ink-accent-soft);
  border-color: var(--ink-accent);
}

.update-btn-primary {
  color: #fff;
  background: var(--ink-accent);
  border: 1px solid var(--ink-accent);
}

.update-btn-primary:hover {
  filter: brightness(1.06);
}
</style>
