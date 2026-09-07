<script setup lang="ts">
import { computed } from "vue";
import type { AgentActivity } from "../../agent/types";
import AgentThinkingPanel from "./AgentThinkingPanel.vue";
import AgentToolChips from "./AgentToolChips.vue";

type ActivitySegment =
  | { key: string; type: "thinking"; activities: AgentActivity[] }
  | { key: string; type: "tools"; activities: AgentActivity[] };

const props = defineProps<{
  activities?: AgentActivity[];
  documentPath?: string | null;
}>();

function isThinking(activity: AgentActivity) {
  return activity.kind === "thinking" || activity.tool === "thinking";
}

const segments = computed<ActivitySegment[]>(() => {
  const grouped: ActivitySegment[] = [];
  for (const activity of props.activities ?? []) {
    const type = isThinking(activity) ? "thinking" : "tools";
    const last = grouped[grouped.length - 1];
    if (last?.type === type) {
      last.activities.push(activity);
      continue;
    }
    grouped.push({
      key: `${type}-${activity.id}`,
      type,
      activities: [activity],
    });
  }
  return grouped;
});

function thinkingSource(activities: AgentActivity[]) {
  return activities
    .map((item) => item.detail?.trim())
    .filter((item): item is string => Boolean(item))
    .join("\n\n");
}

function thinkingRunning(activities: AgentActivity[]) {
  return activities.some((item) => item.status === "running");
}
</script>

<template>
  <template v-for="segment in segments" :key="segment.key">
    <AgentThinkingPanel
      v-if="segment.type === 'thinking'"
      :running="thinkingRunning(segment.activities)"
      :source="thinkingSource(segment.activities)"
      :document-path="documentPath"
    />
    <AgentToolChips v-else :tools="segment.activities" />
  </template>
</template>
