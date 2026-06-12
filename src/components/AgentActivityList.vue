<script setup lang="ts">
import type { AgentActivity } from "../composables/useAI";

defineProps<{
  activities: AgentActivity[];
  done?: boolean;
}>();
</script>

<template>
  <ul class="agent-activities" :class="{ 'agent-activities-done': done }">
    <li
      v-for="act in activities"
      :key="act.id"
      class="agent-activity"
      :class="`agent-activity-${act.status}`"
    >
      <div class="agent-activity-header">
        <span class="agent-activity-dot" aria-hidden="true" />
        <span class="agent-activity-tool">{{ act.tool }}</span>
        <span class="agent-activity-summary">{{ act.summary || act.status }}</span>
      </div>
      <details v-if="act.detail" class="agent-activity-detail-wrap">
        <summary>查看返回值</summary>
        <pre class="agent-activity-detail">{{ act.detail }}</pre>
      </details>
    </li>
  </ul>
</template>

<style scoped>
.agent-activities {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 11px;
  color: var(--ink-text-muted);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ink-bg) 72%, var(--ink-surface));
  overflow: hidden;
}

.agent-activities-done {
  margin-top: 10px;
}

.agent-activity {
  padding: 8px 9px;
  border-top: 1px solid var(--ink-border);
}

.agent-activity:first-child {
  border-top: none;
}

.agent-activity-header {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 7px;
  align-items: center;
}

.agent-activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ink-text-muted);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink-text-muted) 10%, transparent);
}

.agent-activity-running .agent-activity-dot {
  background: var(--ink-accent);
  box-shadow: 0 0 0 3px var(--ink-accent-soft);
}

.agent-activity-done .agent-activity-dot {
  background: #38a169;
  box-shadow: 0 0 0 3px color-mix(in srgb, #38a169 12%, transparent);
}

.agent-activity-error .agent-activity-dot {
  background: #c44;
  box-shadow: 0 0 0 3px color-mix(in srgb, #c44 12%, transparent);
}

.agent-activity-tool {
  font-weight: 600;
  color: var(--ink-text);
  flex-shrink: 0;
}

.agent-activity-summary {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.agent-activity-error .agent-activity-summary {
  color: #c44;
}

.agent-activity-detail-wrap {
  margin-top: 4px;
}

.agent-activity-detail-wrap summary {
  cursor: pointer;
  color: var(--ink-accent);
  user-select: none;
  font-size: 10px;
  font-weight: 600;
}

.agent-activity-detail {
  margin: 6px 0 0;
  padding: 9px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 10px;
  line-height: 1.5;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  color: var(--ink-text);
}
</style>
