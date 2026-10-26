<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { Check, Copy, Crop, X, ZoomIn, ZoomOut } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";
import { useAppToast } from "../composables/useAppToast";
import { elementToPngBlob, writePngToClipboard } from "../lib/copy-image";
import { renderMermaidSvg, type MermaidVector } from "../composables/useMermaid";

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const SCALE_STEP = 1.25;
/** Small diagrams are allowed to grow into the window; SVG stays sharp. */
const MAX_MERMAID_FIT_UPSCALE = 2;
/** How much of the diagram must stay inside the stage while panning. */
const MIN_VISIBLE_PAN = 96;
const PAN_KEY_STEP = 64;
/** Pointer slop below which a drag still counts as a click. */
const CLICK_SLOP = 4;

const props = defineProps<{
  open: boolean;
  src?: string;
  svgHtml?: string;
  mermaidSource?: string;
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
const stageRef = ref<HTMLElement | null>(null);
const fitRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLElement | null>(null);
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const baseSize = ref({ width: 0, height: 0 });
const naturalSize = ref({ width: 0, height: 0 });
const vector = ref<MermaidVector | null>(null);
const vectorFailed = ref(false);
const imageError = ref(false);
const dragging = ref(false);
const copyState = ref<"idle" | "copying" | "copied">("idle");
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
let vectorRenderToken = 0;
let pointerOrigin = { x: 0, y: 0 };
let pointerTravel = 0;
let pointerCaptured = false;

const isMermaid = computed(() => Boolean(props.mermaidSource) || Boolean(props.svgHtml));
const displayMarkup = computed(() => vector.value?.markup ?? props.svgHtml ?? "");
const viewerError = computed(() =>
  isMermaid.value ? vectorFailed.value && !props.svgHtml : imageError.value,
);
const canCopyImage = computed(() => isMermaid.value && Boolean(displayMarkup.value));
const copyLabel = computed(() => {
  if (copyState.value === "copying") return t("editor.imageLightbox.copying");
  if (copyState.value === "copied") return t("editor.imageLightbox.copied");
  return t("editor.imageLightbox.copy");
});

const imageStyle = computed(() => {
  const style: Record<string, string> = {
    transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  };
  const base = baseSize.value;
  if (base.width > 0 && base.height > 0) {
    style.width = `${base.width}px`;
    style.height = `${base.height}px`;
  }
  return style;
});

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

function clampPan() {
  const fit = fitRef.value;
  const base = baseSize.value;
  if (!fit || !base.width) return;

  const scaledWidth = base.width * scale.value;
  const scaledHeight = base.height * scale.value;
  const limitX =
    scaledWidth <= fit.clientWidth
      ? Math.max(0, (fit.clientWidth - scaledWidth) / 2)
      : Math.max(0, (scaledWidth + fit.clientWidth) / 2 - MIN_VISIBLE_PAN);
  const limitY =
    scaledHeight <= fit.clientHeight
      ? Math.max(0, (fit.clientHeight - scaledHeight) / 2)
      : Math.max(0, (scaledHeight + fit.clientHeight) / 2 - MIN_VISIBLE_PAN);

  tx.value = Math.min(limitX, Math.max(-limitX, tx.value));
  ty.value = Math.min(limitY, Math.max(-limitY, ty.value));
}

/** Sizes the content so it fits the stage; `scale` 1 therefore means "fit". */
function applyFit() {
  const fit = fitRef.value;
  const natural = naturalSize.value;
  if (!fit || !natural.width || !natural.height) {
    baseSize.value = { width: 0, height: 0 };
    return;
  }

  const maxFactor = isMermaid.value ? MAX_MERMAID_FIT_UPSCALE : 1;
  const factor = Math.min(
    maxFactor,
    Math.max(fit.clientWidth, 1) / natural.width,
    Math.max(fit.clientHeight, 1) / natural.height,
  );

  baseSize.value = {
    width: Math.max(1, Math.round(natural.width * factor)),
    height: Math.max(1, Math.round(natural.height * factor)),
  };
}

function measureRenderedSvg() {
  const svg = imageRef.value?.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) return;
  const box = svg.viewBox?.baseVal;
  if (box && box.width > 0 && box.height > 0) {
    naturalSize.value = { width: box.width, height: box.height };
    return;
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    naturalSize.value = { width: rect.width, height: rect.height };
  }
}

async function syncDiagramSize() {
  if (!isMermaid.value) return;
  await nextTick();
  if (vector.value) {
    naturalSize.value = { width: vector.value.width, height: vector.value.height };
  } else {
    measureRenderedSvg();
  }
  applyFit();
}

/**
 * Re-renders the diagram from its source with vector-only labels, so zooming
 * never blurs (the clone from the preview embeds HTML labels in foreignObject).
 */
async function refreshVector() {
  const source = props.mermaidSource?.trim() ?? "";
  if (!source) {
    await syncDiagramSize();
    return;
  }

  const token = ++vectorRenderToken;
  try {
    const rendered = await renderMermaidSvg(source);
    if (token !== vectorRenderToken) return;
    vector.value = rendered;
    vectorFailed.value = false;
    if (!props.open) return;
    await syncDiagramSize();
    resetView();
  } catch (error) {
    if (token !== vectorRenderToken) return;
    console.error("Mermaid vector render failed:", error);
    vector.value = null;
    vectorFailed.value = true;
    await syncDiagramSize();
  }
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
  clampPan();
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
  pointerTravel = 0;
  pointerCaptured = false;
  pointerOrigin = { x: event.clientX, y: event.clientY };
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  const dx = event.clientX - pointerOrigin.x;
  const dy = event.clientY - pointerOrigin.y;
  if (dx === 0 && dy === 0) return;

  pointerTravel += Math.abs(dx) + Math.abs(dy);
  pointerOrigin = { x: event.clientX, y: event.clientY };
  // Capture only once a real drag starts: pointer capture retargets the
  // following `click` event to the stage, which would break click-to-close.
  if (!pointerCaptured && pointerTravel > CLICK_SLOP) {
    pointerCaptured = true;
    stageRef.value?.setPointerCapture(event.pointerId);
  }
  tx.value += dx;
  ty.value += dy;
  clampPan();
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  const stage = stageRef.value;
  if (pointerCaptured && stage?.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }
  pointerCaptured = false;
}

function onDoubleClick(event: MouseEvent) {
  if (Math.abs(scale.value - 1) > 0.05 || tx.value !== 0 || ty.value !== 0) {
    resetView();
    return;
  }
  setScaleAt(2.5, event.clientX, event.clientY);
}

function onStageClick(event: MouseEvent) {
  if (pointerTravel > CLICK_SLOP) return;
  // Only the empty backdrop closes; clicks on the diagram/image are ignored.
  if (event.target !== stageRef.value && event.target !== fitRef.value) return;
  emit("close");
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

function onImageLoad(event: Event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  imageError.value = false;
  naturalSize.value = {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
  applyFit();
  resetView();
}

function onImageError() {
  imageError.value = true;
}

function panBy(dx: number, dy: number) {
  tx.value += dx;
  ty.value += dy;
  clampPan();
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
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    panBy(PAN_KEY_STEP, 0);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    panBy(-PAN_KEY_STEP, 0);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    panBy(0, PAN_KEY_STEP);
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    panBy(0, -PAN_KEY_STEP);
  }
}

function onResize() {
  if (!props.open) return;
  applyFit();
  clampPan();
}

function attachWindowListeners() {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", onResize);
}

function detachWindowListeners() {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", onResize);
}

watch(
  () => [props.open, props.src, props.svgHtml, props.mermaidSource] as const,
  ([open]) => {
    vectorRenderToken += 1;
    resetCopyState();
    vector.value = null;
    vectorFailed.value = false;
    imageError.value = false;
    naturalSize.value = { width: 0, height: 0 };
    baseSize.value = { width: 0, height: 0 };
    resetView();

    if (!open) {
      detachWindowListeners();
      return;
    }

    attachWindowListeners();
    void nextTick(() => {
      overlayRef.value?.focus();
      void refreshVector();
    });
  },
);

onUnmounted(() => {
  detachWindowListeners();
  clearCopyResetTimer();
  vectorRenderToken += 1;
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

      <div
        ref="stageRef"
        class="image-lightbox-stage"
        :class="{ 'is-mermaid': isMermaid, 'is-dragging': dragging }"
        @click="onStageClick"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick.prevent="onDoubleClick"
      >
        <div ref="fitRef" class="image-lightbox-fit">
          <div
            v-if="isMermaid"
            ref="imageRef"
            class="image-lightbox-image is-svg"
            :class="{ 'is-measuring': !baseSize.width }"
            :style="imageStyle"
            v-html="displayMarkup"
          />
          <img
            v-else-if="src && !imageError"
            ref="imageRef"
            class="image-lightbox-image"
            :class="{ 'is-measuring': !baseSize.width }"
            :src="src"
            :alt="alt || ''"
            :style="imageStyle"
            draggable="false"
            @load="onImageLoad"
            @error="onImageError"
          />
          <p v-if="viewerError" class="image-lightbox-error">
            {{
              isMermaid
                ? t("editor.imageLightbox.renderFailed")
                : t("editor.imageLightbox.loadFailed")
            }}
          </p>
        </div>
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
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}

.image-lightbox-stage.is-dragging {
  cursor: grabbing;
}

/* No padding here: `clientWidth`/`clientHeight` are used as the fit budget. */
.image-lightbox-fit {
  position: absolute;
  inset: 76px 40px 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-lightbox-image {
  display: block;
  flex: 0 0 auto;
  max-width: none;
  max-height: none;
  transform-origin: center center;
  user-select: none;
  -webkit-user-drag: none;
}

.image-lightbox-image.is-measuring {
  visibility: hidden;
}

.image-lightbox-image.is-svg {
  background: var(--ink-bg);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.image-lightbox-image.is-svg :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.image-lightbox-error {
  margin: 0;
  padding: 0 24px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
}
</style>
