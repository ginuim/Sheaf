<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { Crop, X } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";
import {
  cropImageElement,
  cropRectToNatural,
  normalizeCropRect,
  type DisplayCropRect,
} from "../lib/crop-image";

const props = defineProps<{
  open: boolean;
  imageSrc: string;
  outputMimeType?: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [blob: Blob];
}>();

const { t } = useLocale();

const stageRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const imageLoaded = ref(false);
const imageError = ref(false);
const saving = ref(false);

const displaySize = ref({ width: 0, height: 0 });
const cropRect = ref<DisplayCropRect>({ x: 0, y: 0, width: 0, height: 0 });

type DragMode =
  | "move"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w";

const cropHandles: DragMode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const dragState = ref<{
  mode: DragMode;
  startX: number;
  startY: number;
  origin: DisplayCropRect;
} | null>(null);

const cropStyle = computed(() => ({
  left: `${cropRect.value.x}px`,
  top: `${cropRect.value.y}px`,
  width: `${cropRect.value.width}px`,
  height: `${cropRect.value.height}px`,
}));

const canConfirm = computed(
  () => imageLoaded.value && cropRect.value.width > 0 && cropRect.value.height > 0,
);

function resetState() {
  imageLoaded.value = false;
  imageError.value = false;
  saving.value = false;
  displaySize.value = { width: 0, height: 0 };
  cropRect.value = { x: 0, y: 0, width: 0, height: 0 };
  dragState.value = null;
}

function fitImageToStage() {
  const stage = stageRef.value;
  const image = imageRef.value;
  if (!stage || !image || !image.naturalWidth || !image.naturalHeight) return;

  const maxWidth = stage.clientWidth;
  const maxHeight = stage.clientHeight;
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  displaySize.value = { width, height };
  cropRect.value = { x: 0, y: 0, width, height };
}

function onImageLoad() {
  imageLoaded.value = true;
  imageError.value = false;
  void nextTick(() => fitImageToStage());
}

function onImageError() {
  imageLoaded.value = false;
  imageError.value = true;
}

function beginDrag(mode: DragMode, event: PointerEvent) {
  if (!imageLoaded.value) return;
  event.preventDefault();
  event.stopPropagation();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragState.value = {
    mode,
    startX: event.clientX,
    startY: event.clientY,
    origin: { ...cropRect.value },
  };
}

function updateDrag(event: PointerEvent) {
  const drag = dragState.value;
  if (!drag) return;

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  const bounds = displaySize.value;
  const origin = drag.origin;
  let next = { ...origin };

  switch (drag.mode) {
    case "move":
      next.x = origin.x + dx;
      next.y = origin.y + dy;
      break;
    case "nw":
      next.x = origin.x + dx;
      next.y = origin.y + dy;
      next.width = origin.width - dx;
      next.height = origin.height - dy;
      break;
    case "ne":
      next.y = origin.y + dy;
      next.width = origin.width + dx;
      next.height = origin.height - dy;
      break;
    case "sw":
      next.x = origin.x + dx;
      next.width = origin.width - dx;
      next.height = origin.height + dy;
      break;
    case "se":
      next.width = origin.width + dx;
      next.height = origin.height + dy;
      break;
    case "n":
      next.y = origin.y + dy;
      next.height = origin.height - dy;
      break;
    case "s":
      next.height = origin.height + dy;
      break;
    case "e":
      next.width = origin.width + dx;
      break;
    case "w":
      next.x = origin.x + dx;
      next.width = origin.width - dx;
      break;
  }

  cropRect.value = normalizeCropRect(next, bounds);
}

function endDrag(event: PointerEvent) {
  if (!dragState.value) return;
  dragState.value = null;
  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

async function handleConfirm() {
  const image = imageRef.value;
  if (!image || !canConfirm.value || saving.value) return;

  saving.value = true;
  try {
    const naturalRect = cropRectToNatural(cropRect.value, displaySize.value, {
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    const mimeType = props.outputMimeType ?? "image/png";
    const blob = await cropImageElement(image, naturalRect, mimeType);
    emit("confirm", blob);
  } finally {
    saving.value = false;
  }
}

function handleWindowResize() {
  if (!props.open || !imageLoaded.value) return;
  fitImageToStage();
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetState();
      return;
    }
    resetState();
    void nextTick(() => {
      const image = imageRef.value;
      if (!image) return;
      if (image.complete && image.naturalWidth > 0) {
        onImageLoad();
        return;
      }
      void image.decode().then(() => {
        if (props.open && image.naturalWidth > 0) {
          onImageLoad();
        }
      }).catch(() => undefined);
    });
  },
);

watch(
  () => props.imageSrc,
  () => {
    if (!props.open) return;
    resetState();
  },
);

onUnmounted(() => {
  window.removeEventListener("resize", handleWindowResize);
  window.removeEventListener("pointermove", updateDrag);
  window.removeEventListener("pointerup", endDrag);
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener("resize", handleWindowResize);
      window.addEventListener("pointermove", updateDrag);
      window.addEventListener("pointerup", endDrag);
    } else {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("pointermove", updateDrag);
      window.removeEventListener("pointerup", endDrag);
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="image-crop-overlay" @click.self="emit('close')">
      <div
        class="image-crop-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
      >
        <header class="image-crop-header">
          <div class="image-crop-heading">
            <Crop :size="18" aria-hidden="true" />
            <h2 id="image-crop-title">{{ t("editor.imageCrop.title") }}</h2>
          </div>
          <button
            class="image-crop-close"
            type="button"
            :aria-label="t('editor.imageCrop.close')"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </header>

        <div ref="stageRef" class="image-crop-stage">
          <div
            class="image-crop-frame"
            :class="{ 'is-ready': imageLoaded }"
            :style="imageLoaded ? { width: `${displaySize.width}px`, height: `${displaySize.height}px` } : undefined"
          >
            <img
              ref="imageRef"
              class="image-crop-image"
              :src="imageSrc"
              alt=""
              draggable="false"
              @load="onImageLoad"
              @error="onImageError"
            />

            <template v-if="imageLoaded">
              <div class="image-crop-mask image-crop-mask-top" :style="{ height: `${cropRect.y}px` }" />
              <div
                class="image-crop-mask image-crop-mask-bottom"
                :style="{
                  top: `${cropRect.y + cropRect.height}px`,
                  height: `${Math.max(displaySize.height - cropRect.y - cropRect.height, 0)}px`,
                }"
              />
              <div
                class="image-crop-mask image-crop-mask-left"
                :style="{
                  top: `${cropRect.y}px`,
                  width: `${cropRect.x}px`,
                  height: `${cropRect.height}px`,
                }"
              />
              <div
                class="image-crop-mask image-crop-mask-right"
                :style="{
                  top: `${cropRect.y}px`,
                  left: `${cropRect.x + cropRect.width}px`,
                  width: `${Math.max(displaySize.width - cropRect.x - cropRect.width, 0)}px`,
                  height: `${cropRect.height}px`,
                }"
              />

              <div
                class="image-crop-selection"
                :style="cropStyle"
                @pointerdown="beginDrag('move', $event)"
              >
                <span
                  v-for="handle in cropHandles"
                  :key="handle"
                  class="image-crop-handle"
                  :class="`is-${handle}`"
                  @pointerdown="beginDrag(handle, $event)"
                />
              </div>
            </template>
          </div>

          <p v-if="imageError" class="image-crop-error">
            {{ t("editor.imageCrop.loadFailed") }}
          </p>
        </div>

        <footer class="image-crop-footer">
          <p class="image-crop-hint">{{ t("editor.imageCrop.hint") }}</p>
          <div class="image-crop-actions">
            <button class="image-crop-btn image-crop-btn-secondary" type="button" @click="emit('close')">
              {{ t("editor.imageCrop.cancel") }}
            </button>
            <button
              class="image-crop-btn image-crop-btn-primary"
              type="button"
              :disabled="!canConfirm || saving"
              @click="handleConfirm"
            >
              {{ saving ? t("editor.imageCrop.saving") : t("editor.imageCrop.confirm") }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-crop-overlay {
  position: fixed;
  inset: 0;
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  -webkit-app-region: no-drag;
}

.image-crop-window {
  width: min(860px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
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

.image-crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ink-border);
}

.image-crop-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.image-crop-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.image-crop-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-text-muted);
  cursor: pointer;
}

.image-crop-close:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.image-crop-stage {
  position: relative;
  flex: 1;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--ink-bg) 88%, transparent);
  overflow: hidden;
}

.image-crop-frame {
  position: relative;
  user-select: none;
  touch-action: none;
  max-width: 100%;
  max-height: 100%;
}

.image-crop-frame:not(.is-ready) .image-crop-image {
  max-width: min(100%, 720px);
  max-height: 420px;
  width: auto;
  height: auto;
  opacity: 0.001;
}

.image-crop-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-crop-mask {
  position: absolute;
  left: 0;
  background: rgba(0, 0, 0, 0.48);
  pointer-events: none;
}

.image-crop-mask-top {
  top: 0;
  width: 100%;
}

.image-crop-mask-bottom {
  left: 0;
  width: 100%;
}

.image-crop-selection {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  cursor: move;
}

.image-crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: var(--ink-accent);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.image-crop-handle.is-nw {
  top: -7px;
  left: -7px;
  cursor: nwse-resize;
}

.image-crop-handle.is-n {
  top: -7px;
  left: calc(50% - 6px);
  cursor: ns-resize;
}

.image-crop-handle.is-ne {
  top: -7px;
  right: -7px;
  cursor: nesw-resize;
}

.image-crop-handle.is-e {
  top: calc(50% - 6px);
  right: -7px;
  cursor: ew-resize;
}

.image-crop-handle.is-se {
  right: -7px;
  bottom: -7px;
  cursor: nwse-resize;
}

.image-crop-handle.is-s {
  bottom: -7px;
  left: calc(50% - 6px);
  cursor: ns-resize;
}

.image-crop-handle.is-sw {
  bottom: -7px;
  left: -7px;
  cursor: nesw-resize;
}

.image-crop-handle.is-w {
  top: calc(50% - 6px);
  left: -7px;
  cursor: ew-resize;
}

.image-crop-error {
  margin: 0;
  color: #b42318;
  font-size: 14px;
}

.image-crop-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid var(--ink-border);
}

.image-crop-hint {
  margin: 0;
  color: var(--ink-text-muted);
  font-size: 13px;
}

.image-crop-actions {
  display: flex;
  gap: 10px;
}

.image-crop-btn {
  min-width: 88px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--ink-border);
  font-size: 14px;
  cursor: pointer;
}

.image-crop-btn-secondary {
  background: var(--ink-surface);
  color: var(--ink-text);
}

.image-crop-btn-primary {
  border-color: var(--ink-accent);
  background: var(--ink-accent);
  color: #fff;
}

.image-crop-btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
