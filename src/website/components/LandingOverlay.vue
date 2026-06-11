<script setup lang="ts">
import { onUnmounted, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { lockBodyScroll, unlockBodyScroll } from "../composables/useBodyScrollLock";

const props = defineProps<{
  open: boolean;
  title: string;
  titleId: string;
  lead?: string;
}>();

const emit = defineEmits<{ close: [] }>();
const { t } = useLocale();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      lockBodyScroll();
      window.addEventListener("keydown", onKeydown);
    } else {
      unlockBodyScroll();
      window.removeEventListener("keydown", onKeydown);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (props.open) unlockBodyScroll();
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="landing-overlay" @click.self="emit('close')">
      <div
        class="landing-overlay-panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header class="landing-overlay-header">
          <div>
            <h2 :id="titleId">{{ title }}</h2>
            <p v-if="lead" class="landing-overlay-lead">{{ lead }}</p>
          </div>
          <button
            type="button"
            class="landing-overlay-close"
            :aria-label="t('landing.overlay.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </header>
        <div class="landing-overlay-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
