<script setup lang="ts">
import {
  Check,
  ChevronDown,
  FilePenLine,
  FileText,
  Globe,
  Image,
  Loader2,
  Wrench,
  X,
} from "@lucide/vue";
import { computed, ref, watch } from "vue";
import type { AgentActivity } from "../../agent/types";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  tools: AgentActivity[];
}>();

const { t } = useLocale();

function toolsRunning(tools: AgentActivity[]): boolean {
  return tools.some((item) => item.status === "running");
}

const open = ref(toolsRunning(props.tools));
const openRows = ref(new Set<string>());

watch(
  () => toolsRunning(props.tools),
  (running, wasRunning) => {
    if (running) open.value = true;
    else if (wasRunning) open.value = false;
  },
);

const headerText = computed(() => {
  const total = props.tools.length;
  const running = props.tools.filter((item) => item.status === "running").length;
  const ok = props.tools.filter((item) => item.status === "done").length;
  const err = props.tools.filter((item) => item.status === "error").length;
  if (running > 0) return t("ai.toolCallsRunning", { count: total, running });
  if (err > 0) return t("ai.toolCallsResult", { count: total, ok, err });
  return t("ai.toolCalls", { count: total });
});

function toggleRow(id: string) {
  const next = new Set(openRows.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openRows.value = next;
}

function isRowOpen(id: string) {
  return openRows.value.has(id);
}

function iconFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("write") || n.includes("edit")) return FilePenLine;
  if (n.includes("web") || n.includes("fetch") || n.includes("search")) return Globe;
  if (n.includes("image") || n.includes("generate")) return Image;
  if (n.includes("read") || n.includes("grep") || n.includes("list") || n.includes("file")) {
    return FileText;
  }
  return Wrench;
}

function chipText(tool: AgentActivity): string {
  const summary = tool.summary?.trim();
  if (summary) return summary.slice(0, 80);
  const detail = tool.detail?.trim().split("\n")[0] ?? "";
  if (detail) return detail.slice(0, 80);
  return tool.tool;
}

function detailLines(tool: AgentActivity): string[] {
  const lines: string[] = [];
  if (tool.summary?.trim()) lines.push(tool.summary.trim());
  if (tool.detail?.trim()) {
    const snippet = tool.detail.trim().split("\n").slice(0, 6);
    lines.push(...snippet.map((line) => (line.length > 100 ? `${line.slice(0, 100)}…` : line)));
  }
  if (!lines.length) {
    lines.push(tool.status === "running" ? t("ai.toolRunning") : t("ai.noToolOutput"));
  }
  return lines;
}

function chipStatus(tool: AgentActivity) {
  return tool.status === "done" ? "ok" : tool.status;
}
</script>

<template>
  <div v-if="tools.length" class="agent-tools">
    <button
      type="button"
      class="agent-tools-header"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Wrench
        class="agent-tools-header-ico"
        :size="15"
        stroke-width="1.8"
        aria-hidden="true"
      />
      <span>{{ headerText }}</span>
      <ChevronDown
        class="agent-tools-header-chevron"
        :class="{ open }"
        :size="14"
        stroke-width="2"
        aria-hidden="true"
      />
    </button>

    <div class="agent-tools-body" :class="{ open }">
      <div class="agent-tools-body-inner">
        <div class="agent-tools-list">
          <div v-for="tool in tools" :key="tool.id" class="agent-tools-row-wrap">
            <button
              type="button"
              class="agent-tools-row"
              :aria-expanded="isRowOpen(tool.id)"
              @click="toggleRow(tool.id)"
            >
              <span class="agent-tools-icon-slot">
                <component
                  :is="iconFor(tool.tool)"
                  class="agent-tools-icon"
                  :class="{ hide: isRowOpen(tool.id) }"
                  :size="13"
                  stroke-width="2"
                  aria-hidden="true"
                />
                <ChevronDown
                  class="agent-tools-row-chevron"
                  :class="{ open: isRowOpen(tool.id) }"
                  :size="12"
                  stroke-width="2.2"
                  aria-hidden="true"
                />
              </span>
              <span class="agent-tools-name">{{ tool.tool }}</span>
              <span class="agent-tools-chip" :title="chipText(tool)">{{ chipText(tool) }}</span>
              <span class="agent-tools-status" :data-status="chipStatus(tool)" aria-hidden="true">
                <Loader2 v-if="tool.status === 'running'" class="spin" :size="12" stroke-width="2.2" />
                <Check v-else-if="tool.status === 'done'" :size="12" stroke-width="2.4" />
                <X v-else :size="12" stroke-width="2.4" />
              </span>
            </button>

            <div class="agent-tools-detail" :class="{ open: isRowOpen(tool.id) }">
              <div class="agent-tools-detail-inner">
                <div class="agent-tools-detail-rail">
                  <span
                    v-for="(line, idx) in detailLines(tool)"
                    :key="`${tool.id}-${idx}`"
                    class="agent-tools-detail-line"
                    :class="{ mono: Boolean(tool.detail) }"
                  >
                    {{ line }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-tools {
  margin: 4px 0 8px;
  max-width: min(100%, 420px);
}

.agent-tools-header {
  display: inline-flex;
  width: fit-content;
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
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color 100ms ease;
}

.agent-tools-header:hover {
  background: color-mix(in srgb, var(--ink-text) 5%, transparent);
}

.agent-tools-header-ico {
  flex: none;
  color: inherit;
}

.agent-tools-header-chevron {
  flex: none;
  color: var(--ink-text-muted);
  opacity: 0;
  transition:
    transform 280ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms ease;
  transform: rotate(-90deg);
}

.agent-tools-header:hover .agent-tools-header-chevron,
.agent-tools-header:focus-visible .agent-tools-header-chevron {
  opacity: 1;
}

.agent-tools-header-chevron.open {
  transform: rotate(0deg);
}

.agent-tools-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 280ms ease,
    opacity 200ms ease;
}

.agent-tools-body.open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.agent-tools-body-inner {
  overflow: hidden;
  min-height: 0;
}

.agent-tools-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  padding-bottom: 2px;
}

.agent-tools-row {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 28px;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-text);
  text-align: left;
  cursor: pointer;
  transition: background-color 100ms ease;
}

.agent-tools-row:hover {
  background: color-mix(in srgb, var(--ink-text) 5%, transparent);
}

.agent-tools-icon-slot {
  position: relative;
  display: flex;
  width: 16px;
  height: 16px;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--ink-text-muted);
}

.agent-tools-icon {
  transition: opacity 100ms ease;
}

.agent-tools-row:hover .agent-tools-icon,
.agent-tools-icon.hide {
  opacity: 0;
}

.agent-tools-row-chevron {
  position: absolute;
  opacity: 0;
  transition:
    opacity 120ms ease,
    transform 150ms ease;
  transform: rotate(-90deg);
}

.agent-tools-row:hover .agent-tools-row-chevron,
.agent-tools-row-chevron.open {
  opacity: 1;
}

.agent-tools-row-chevron.open {
  transform: rotate(0deg);
}

.agent-tools-name {
  flex: none;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
}

.agent-tools-chip {
  min-width: 0;
  flex: 1;
  height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  overflow: hidden;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ink-text) 5%, var(--ink-surface));
  color: var(--ink-text-muted);
  font-family: var(--font-editor);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agent-tools-status {
  flex: none;
  display: inline-flex;
  color: var(--ink-text-muted);
}

.agent-tools-status[data-status="ok"] {
  color: #2f855a;
}

.agent-tools-status[data-status="error"] {
  color: #c53030;
}

.agent-tools-status .spin {
  animation: agent-spin 700ms linear infinite;
}

.agent-tools-detail {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 280ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 200ms ease;
}

.agent-tools-detail.open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.agent-tools-detail-inner {
  overflow: hidden;
  min-height: 0;
}

.agent-tools-detail-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 10px;
  padding: 2px 0 2px 12px;
  border-left: 1px solid var(--ink-border);
}

.agent-tools-detail-line {
  overflow: hidden;
  color: var(--ink-text-muted);
  font-size: 11px;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-tools-detail-line.mono {
  font-family: var(--font-editor);
}

@media (prefers-reduced-motion: reduce) {
  .agent-tools-body,
  .agent-tools-detail,
  .agent-tools-header-chevron,
  .agent-tools-row-chevron {
    transition: none;
  }

  .agent-tools-status .spin {
    animation: none;
  }
}
</style>

<style>
@keyframes agent-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
