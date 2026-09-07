<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";

export type LoadingVariant = "Drive" | "Dots" | "Orbit";

const props = withDefaults(
  defineProps<{
    label?: string;
    variant?: LoadingVariant;
    startedAt?: number;
  }>(),
  {
    variant: "Drive",
  },
);

const { t } = useLocale();

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

const PATTERNS: Record<LoadingVariant, { delays: (number | null)[]; dur: number; round: boolean }> = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
};

const pattern = computed(() => PATTERNS[props.variant] ?? PATTERNS.Drive);
const displayLabel = computed(() => props.label || t("ai.generating"));
const elapsedText = ref("0.0s");
const reduceMotion = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;
let anchor = Date.now();

function formatElapsed(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

function tick() {
  elapsedText.value = formatElapsed(Date.now() - anchor);
}

function resetAnchor() {
  anchor = props.startedAt && props.startedAt > 0 ? props.startedAt : Date.now();
  tick();
}

onMounted(() => {
  reduceMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resetAnchor();
  timer = setInterval(tick, 100);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

watch(
  () => props.startedAt,
  () => resetAnchor(),
);
</script>

<template>
  <div
    class="agent-loading"
    role="status"
    :aria-label="t('ai.loadingElapsed', { label: displayLabel, elapsed: elapsedText })"
  >
    <span class="agent-loading-grid" aria-hidden="true">
      <span
        v-for="(delay, i) in pattern.delays"
        :key="i"
        class="agent-loading-cell"
        :class="{ round: pattern.round }"
        :style="
          reduceMotion || delay === null
            ? { opacity: delay === null ? 0.07 : 0.15, animation: 'none' }
            : {
                opacity: 0.15,
                animation: `agent-pixel-on ${pattern.dur}ms ease-in-out ${delay}ms infinite`,
              }
        "
      />
    </span>
    <span class="agent-loading-label">{{ displayLabel }}</span>
    <span class="agent-loading-elapsed">{{ elapsedText }}</span>
  </div>
</template>

<style scoped>
.agent-loading {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 10px;
  margin: 2px 0 4px;
}

.agent-loading-grid {
  display: grid;
  grid-template-columns: repeat(3, 4px);
  gap: 1.5px;
}

.agent-loading-cell {
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--ink-text);
}

.agent-loading-cell.round {
  border-radius: 999px;
}

.agent-loading-label {
  font-size: 12px;
  font-weight: 500;
  background-image: linear-gradient(
    90deg,
    var(--ink-text-muted) 35%,
    var(--ink-text) 50%,
    var(--ink-text-muted) 65%
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: agent-shimmer-text 1.4s linear infinite;
}

.agent-loading-elapsed {
  font-family: var(--font-editor);
  font-size: 11px;
  color: var(--ink-text-muted);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .agent-loading-label {
    animation: none;
    color: var(--ink-text-muted);
    background: none;
    -webkit-background-clip: unset;
    background-clip: unset;
  }
}
</style>

<style>
@keyframes agent-pixel-on {
  0%,
  100% {
    opacity: 0.15;
  }
  18%,
  42% {
    opacity: 1;
  }
  62% {
    opacity: 0.15;
  }
}

@keyframes agent-shimmer-text {
  0% {
    background-position: 150% center;
  }
  100% {
    background-position: -50% center;
  }
}
</style>
