<script setup lang="ts">
import { useAppToast } from "../composables/useAppToast";

const { toast, dismissToast } = useAppToast();
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div
        v-if="toast"
        class="app-toast"
        :class="toast.kind"
        role="status"
        aria-live="polite"
      >
        <span class="app-toast-icon" aria-hidden="true">
          {{ toast.kind === "success" ? "✓" : toast.kind === "error" ? "!" : "i" }}
        </span>
        <p class="app-toast-message">{{ toast.message }}</p>
        <button class="app-toast-close" type="button" aria-label="关闭" @click="dismissToast">
          ×
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--ink-border-strong);
  background: var(--ink-surface);
  color: var(--ink-text);
  box-shadow: 0 10px 30px var(--ink-shadow);
  transform: translateX(-50%);
}

.app-toast.success {
  border-color: color-mix(in srgb, var(--ink-accent) 35%, var(--ink-border-strong));
}

.app-toast.error {
  border-color: color-mix(in srgb, #e53e3e 35%, var(--ink-border-strong));
}

.app-toast-icon {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.app-toast.success .app-toast-icon {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.app-toast.error .app-toast-icon {
  color: #c53030;
  background: color-mix(in srgb, #e53e3e 12%, transparent);
}

.app-toast.info .app-toast-icon {
  color: var(--ink-text-muted);
  background: var(--ink-code-bg);
}

.app-toast-message {
  flex: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}

.app-toast-close {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--ink-text-muted);
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.app-toast-close:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
