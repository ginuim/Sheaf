import { computed, onUnmounted, ref } from "vue";
import {
  CONTENT_ZOOM_DEFAULT,
  clampContentZoom,
  loadContentZoomPercent,
  saveContentZoomPercent,
  zoomInContent,
  zoomOutContent,
} from "../lib/contentZoom";

const WHEEL_STEP_MS = 50;
const HUD_HIDE_MS = 2000;

export function useContentZoom() {
  const percent = ref(loadContentZoomPercent());
  const hudVisible = ref(false);
  let lastWheelAt = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const cssZoom = computed(() => percent.value / 100);

  function revealHud() {
    hudVisible.value = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hudVisible.value = false;
      hideTimer = null;
    }, HUD_HIDE_MS);
  }

  function setPercent(next: number) {
    const clamped = clampContentZoom(next);
    if (clamped !== percent.value) {
      percent.value = clamped;
      saveContentZoomPercent(clamped);
    }
    revealHud();
  }

  function zoomIn() {
    setPercent(zoomInContent(percent.value));
  }

  function zoomOut() {
    setPercent(zoomOutContent(percent.value));
  }

  function resetZoom() {
    setPercent(CONTENT_ZOOM_DEFAULT);
  }

  function zoomByWheel(deltaY: number) {
    const now = Date.now();
    if (now - lastWheelAt < WHEEL_STEP_MS) return;
    lastWheelAt = now;
    if (deltaY < 0) zoomIn();
    else if (deltaY > 0) zoomOut();
  }

  onUnmounted(() => {
    if (hideTimer) clearTimeout(hideTimer);
  });

  return {
    percent,
    cssZoom,
    hudVisible,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomByWheel,
  };
}
