<script setup lang="ts">
import { ChevronDown, Sparkles } from "@lucide/vue";
import { computed, ref } from "vue";
import { renderMarkdown } from "../../composables/useMarkdown";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  running: boolean;
  source?: string;
  documentPath?: string | null;
}>();

const { t } = useLocale();
const open = ref(false);

const label = computed(() =>
  props.running ? t("ai.thinkingRunning") : t("ai.thinkingDone"),
);

const renderedHtml = computed(() => {
  const source = props.source?.trim();
  if (!source) return "";
  return renderMarkdown(source, props.documentPath ?? null);
});

const emptyText = computed(() =>
  props.running ? t("ai.thinkingEmptyRunning") : t("ai.thinkingEmpty"),
);

function toggle() {
  open.value = !open.value;
}
</script>

<template>
  <div class="agent-thinking">
    <button
      type="button"
      class="agent-thinking-toggle"
      :class="{ running }"
      :aria-expanded="open"
      @click="toggle"
    >
      <Sparkles
        class="agent-thinking-ico"
        :size="15"
        :stroke-width="running ? 0 : 1.8"
        :fill="running ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
      <span class="agent-thinking-label" :class="{ shimmer: running }">{{ label }}</span>
      <ChevronDown
        class="agent-thinking-chevron"
        :class="{ open }"
        :size="14"
        stroke-width="2"
        aria-hidden="true"
      />
    </button>

    <div class="agent-thinking-trace" :class="{ open }" :aria-hidden="!open">
      <div class="agent-thinking-trace-inner">
        <div class="agent-thinking-rail" :class="{ live: running }">
          <div
            v-if="renderedHtml"
            class="agent-thinking-md"
            v-html="renderedHtml"
          />
          <span v-else class="agent-thinking-empty">{{ emptyText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-thinking {
  margin: 2px 0 8px;
  max-width: 100%;
}

.agent-thinking-toggle {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  margin: 0 -6px;
  padding: 4px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-text-muted);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color 100ms ease, color 100ms ease;
}

.agent-thinking-toggle:hover {
  background: color-mix(in srgb, var(--ink-text) 5%, transparent);
}

.agent-thinking-toggle.running {
  color: var(--ink-text);
}

.agent-thinking-ico {
  flex: none;
  color: inherit;
}

.agent-thinking-label {
  min-width: 0;
  white-space: nowrap;
}

.agent-thinking-label.shimmer {
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

.agent-thinking-chevron {
  flex: none;
  color: var(--ink-text-muted);
  opacity: 0;
  transition:
    transform 280ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms ease;
  transform: rotate(-90deg);
}

.agent-thinking-toggle:hover .agent-thinking-chevron,
.agent-thinking-toggle:focus-visible .agent-thinking-chevron {
  opacity: 1;
}

.agent-thinking-chevron.open {
  transform: rotate(0deg);
}

.agent-thinking-trace {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 360ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 280ms ease;
}

.agent-thinking-trace.open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.agent-thinking-trace-inner {
  overflow: hidden;
  min-height: 0;
}

.agent-thinking-rail {
  --rail-x: 7.5px;
  --rail-pad: 16px;
  --rail-dot: 5px;
  margin: 4px 0 0 0;
  max-height: 260px;
  overflow: auto;
  color: var(--ink-text-muted);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  user-select: text;
  -webkit-user-select: text;
}

.agent-thinking-rail.live {
  max-height: none;
  overflow: visible;
}

.agent-thinking-md {
  position: relative;
  padding: 2px 0 2px var(--rail-pad);
}

.agent-thinking-md::before {
  content: "";
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: var(--rail-x);
  width: 1px;
  transform: translateX(-50%);
  background: var(--ink-border);
  pointer-events: none;
}

.agent-thinking-md :deep(p) {
  margin: 0.2em 0;
}

.agent-thinking-md :deep(p:first-child) {
  margin-top: 0;
}

.agent-thinking-md :deep(p:last-child) {
  margin-bottom: 0;
}

.agent-thinking-md :deep(ul),
.agent-thinking-md :deep(ol) {
  list-style: none;
  margin: 0.25em 0;
  padding: 0;
}

.agent-thinking-md :deep(li) {
  position: relative;
}

.agent-thinking-md :deep(li + li) {
  margin-top: 0.15em;
}

.agent-thinking-md :deep(li)::before {
  content: "";
  position: absolute;
  top: 0.75em;
  left: calc(var(--rail-x) - var(--rail-pad));
  width: var(--rail-dot);
  height: var(--rail-dot);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--ink-text-muted);
  pointer-events: none;
}

.agent-thinking-md :deep(li > p:first-child) {
  margin-top: 0;
}

.agent-thinking-md :deep(code) {
  color: inherit;
  font-family: var(--font-editor);
  font-size: 0.95em;
}

.agent-thinking-empty {
  color: var(--ink-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .agent-thinking-label.shimmer {
    animation: none;
    color: var(--ink-text);
    background: none;
    -webkit-background-clip: unset;
    background-clip: unset;
  }

  .agent-thinking-trace,
  .agent-thinking-chevron {
    transition: none;
  }
}
</style>
