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
}

.agent-activities-done {
  margin-top: 10px;
}

.agent-activity {
  padding: 6px 0;
  border-top: 1px solid var(--ink-border);
}

.agent-activity:first-child {
  border-top: none;
}

.agent-activity-header {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.agent-activity-tool {
  font-weight: 600;
  color: var(--ink-text);
  flex-shrink: 0;
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
}

.agent-activity-detail {
  margin: 6px 0 0;
  padding: 8px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 10px;
  line-height: 1.45;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  color: var(--ink-text);
}
</style>
