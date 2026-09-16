<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { Check, Copy, Crop, X, ZoomIn, ZoomOut } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";
import { useAppToast } from "../composables/useAppToast";
import { elementToPngBlob, writePngToClipboard } from "../lib/copy-image";

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const SCALE_STEP = 1.25;

const props = defineProps<{
  open: boolean;
  src?: string;
  svgHtml?: string;
  alt?: string;
  cropEnabled?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  crop: [];
}>();

const { t } = useLocale();
const { showToast } = useAppToast();

const overlayRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLElement | null>(null);
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const imageError = ref(false);
const dragging = ref(false);
const copyState = ref<"idle" | "copying" | "copied">("idle");
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const canCopyImage = computed(() => Boolean(props.svgHtml));
const copyLabel = computed(() => {
  if (copyState.value === "copying") return t("editor.imageLightbox.copying");
  if (copyState.value === "copied") return t("editor.imageLightbox.copied");
  return t("editor.imageLightbox.copy");
});

const imageStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
}));

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);
const canZoomIn = computed(() => scale.value < MAX_SCALE - 0.001);
const canZoomOut = computed(() => scale.value > MIN_SCALE + 0.001);

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function resetView() {
  scale.value = 1;
  tx.value = 0;
  ty.value = 0;
  dragging.value = false;
}

function setScaleAt(nextScale: number, clientX: number, clientY: number) {
  const image = imageRef.value;
  const prev = scale.value;
  const next = clampScale(nextScale);
  if (next === prev) return;

  if (!image) {
    scale.value = next;
    return;
  }

  const rect = image.getBoundingClientRect();
  const factor = next / prev;
  tx.value += (clientX - (rect.left + rect.width / 2)) * (1 - factor);
  ty.value += (clientY - (rect.top + rect.height / 2)) * (1 - factor);
  scale.value = next;
}

function zoomAtViewportCenter(nextScale: number) {
  setScaleAt(nextScale, window.innerWidth / 2, window.innerHeight / 2);
}

function zoomIn() {
  zoomAtViewportCenter(scale.value * SCALE_STEP);
}

function zoomOut() {
  zoomAtViewportCenter(scale.value / SCALE_STEP);
}

function onWheel(event: WheelEvent) {
  const factor = event.deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP;
  setScaleAt(scale.value * factor, event.clientX, event.clientY);
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  dragging.value = true;
  const image = event.currentTarget;
  if (!(image instanceof HTMLElement)) return;
  image.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  tx.value += event.movementX;
  ty.value += event.movementY;
}

function onPointerUp(event: PointerEvent) {
  dragging.value = false;
  const image = event.currentTarget;
  if (image instanceof HTMLElement && image.hasPointerCapture(event.pointerId)) {
    image.releasePointerCapture(event.pointerId);
  }
}

function onDoubleClick(event: MouseEvent) {
  if (Math.abs(scale.value - 1) > 0.05 || tx.value !== 0 || ty.value !== 0) {
    resetView();
    return;
  }
  setScaleAt(2.5, event.clientX, event.clientY);
}

function onStageClick(event: MouseEvent) {
  if (event.target === event.currentTarget) emit("close");
}

function clearCopyResetTimer() {
  if (!copyResetTimer) return;
  clearTimeout(copyResetTimer);
  copyResetTimer = null;
}

function resetCopyState() {
  clearCopyResetTimer();
  copyState.value = "idle";
}

async function copyAsImage() {
  if (!canCopyImage.value || copyState.value === "copying") return;
  const source = imageRef.value;
  if (!source) return;

  copyState.value = "copying";
  try {
    const backgroundColor = getComputedStyle(source).backgroundColor || "#ffffff";
    const blobPromise = elementToPngBlob(source, backgroundColor);
    await writePngToClipboard(blobPromise);
    copyState.value = "copied";
    showToast("success", t("editor.imageLightbox.copied"));
    copyResetTimer = setTimeout(() => {
      copyState.value = "idle";
      copyResetTimer = null;
    }, 1600);
  } catch (error) {
    console.error("copy mermaid image failed", error);
    copyState.value = "idle";
    showToast("error", t("editor.imageLightbox.copyFailed"));
  }
}

function onImageLoad() {
  imageError.value = false;
}

function onImageError() {
  imageError.value = true;
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (
    canCopyImage.value &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    (event.key === "c" || event.key === "C")
  ) {
    event.preventDefault();
    void copyAsImage();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomIn();
    return;
  }
  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    zoomOut();
    return;
  }
  if (event.key === "0") {
    event.preventDefault();
    resetView();
  }
}

watch(
  () => props.open,
  (open) => {
    resetView();
    imageError.value = false;
    resetCopyState();
    if (open) {
      window.addEventListener("keydown", onKeydown);
      void nextTick(() => overlayRef.value?.focus());
      return;
    }
    window.removeEventListener("keydown", onKeydown);
  },
);

watch(
  () => [props.src, props.svgHtml] as const,
  () => {
    if (!props.open) return;
    resetView();
    imageError.value = false;
  },
);

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  clearCopyResetTimer();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="overlayRef"
      class="image-lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="t('editor.imageLightbox.title')"
      tabindex="-1"
    >
      <div class="image-lightbox-toolbar" @click.stop>
        <button
          v-if="canCopyImage"
          class="image-lightbox-btn"
          type="button"
          :aria-label="copyLabel"
          :title="copyLabel"
          :disabled="copyState === 'copying'"
          @click="copyAsImage"
        >
          <Check v-if="copyState === 'copied'" :size="18" />
          <Copy v-else :size="18" />
        </button>
        <button
          v-if="cropEnabled"
          class="image-lightbox-btn"
          type="button"
          :aria-label="t('editor.imageLightbox.crop')"
          :title="t('editor.imageLightbox.crop')"
          @click="emit('crop')"
        >
          <Crop :size="18" />
        </button>
        <button
          class="image-lightbox-btn"
          type="button"
          :aria-label="t('editor.imageLightbox.zoomOut')"
          :title="t('editor.imageLightbox.zoomOut')"
          :disabled="!canZoomOut"
          @click="zoomOut"
        >
          <ZoomOut :size="18" />
        </button>
        <button
          class="image-lightbox-zoom"
          type="button"
          :aria-label="t('editor.imageLightbox.reset')"
          :title="t('editor.imageLightbox.reset')"
          @click="resetView"
        >
          {{ zoomLabel }}
        </button>
        <button
          class="image-lightbox-btn"
          type="button"
          :aria-label="t('editor.imageLightbox.zoomIn')"
          :title="t('editor.imageLightbox.zoomIn')"
          :disabled="!canZoomIn"
          @click="zoomIn"
        >
          <ZoomIn :size="18" />
        </button>
        <button
          class="image-lightbox-btn"
          type="button"
          :aria-label="t('editor.imageLightbox.close')"
          :title="t('editor.imageLightbox.close')"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <div class="image-lightbox-stage" @click="onStageClick" @wheel.prevent="onWheel">
        <div
          v-if="svgHtml"
          ref="imageRef"
          class="image-lightbox-image is-svg"
          :class="{ 'is-dragging': dragging }"
          :style="imageStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick.prevent="onDoubleClick"
          v-html="svgHtml"
        />
        <img
          v-else-if="src && !imageError"
          ref="imageRef"
          class="image-lightbox-image"
          :class="{ 'is-dragging': dragging }"
          :src="src"
          :alt="alt || ''"
          :style="imageStyle"
          draggable="false"
          @load="onImageLoad"
          @error="onImageError"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick.prevent="onDoubleClick"
        />
        <p v-if="!svgHtml && imageError" class="image-lightbox-error">
          {{ t("editor.imageLightbox.loadFailed") }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  flex-direction: column;
  background: rgba(8, 8, 8, 0.82);
  outline: none;
  -webkit-app-region: no-drag;
}

.image-lightbox-toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  transform: translateX(-50%);
  background: rgba(20, 20, 20, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.image-lightbox-btn,
.image-lightbox-zoom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
}

.image-lightbox-zoom {
  min-width: 58px;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.image-lightbox-btn:hover,
.image-lightbox-zoom:hover {
  background: rgba(255, 255, 255, 0.1);
}

.image-lightbox-btn:disabled {
  cursor: default;
  opacity: 0.35;
}

.image-lightbox-btn:disabled:hover {
  background: transparent;
}

.image-lightbox-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
  cursor: zoom-out;
}

.image-lightbox-image {
  max-width: min(92vw, 100%);
  max-height: calc(100vh - 48px);
  width: auto;
  height: auto;
  transform-origin: center center;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.image-lightbox-image.is-dragging {
  cursor: grabbing;
}

.image-lightbox-image.is-svg {
  padding: 24px;
  background: var(--ink-bg);
  border-radius: 12px;
}

.image-lightbox-image.is-svg :deep(svg) {
  display: block;
  max-width: 92vw;
  max-height: calc(100vh - 96px);
  height: auto;
}

.image-lightbox-error {
  margin: 0;
  padding: 0 24px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
}
</style>
