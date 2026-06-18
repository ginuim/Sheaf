<script setup lang="ts">
import { computed, type Component } from "vue";
import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Settings,
  WholeWord,
  Strikethrough,
  Minus,
  CheckSquare,
  Table,
} from "@lucide/vue";
import { useLocale } from "../composables/useLocale";
import type {
  MarkdownFormatCommand,
  MarkdownFormatToolId,
} from "../types/markdown-format";

const iconSize = 16;

const props = defineProps<{
  needsFormatSpacing: boolean;
  enabledTools: Record<MarkdownFormatToolId, boolean>;
  toolOrder: MarkdownFormatToolId[];
}>();

const emit = defineEmits<{
  command: [command: MarkdownFormatCommand];
  formatSpacing: [];
  openSettings: [];
}>();

const { t } = useLocale();

type FormatBarButton = {
  id: MarkdownFormatToolId;
  icon: Component;
  label: string;
  group: "block" | "inline" | "insert" | "accent";
};

const allButtons = computed<FormatBarButton[]>(() => [
  { id: "heading1", icon: Heading1, label: t("editor.formatBar.heading1"), group: "block" },
  { id: "heading2", icon: Heading2, label: t("editor.formatBar.heading2"), group: "block" },
  { id: "heading3", icon: Heading3, label: t("editor.formatBar.heading3"), group: "block" },
  { id: "heading4", icon: Heading4, label: t("editor.formatBar.heading4"), group: "block" },
  { id: "bold", icon: Bold, label: t("editor.formatBar.bold"), group: "inline" },
  { id: "italic", icon: Italic, label: t("editor.formatBar.italic"), group: "inline" },
  { id: "strikethrough", icon: Strikethrough, label: t("editor.formatBar.strikethrough"), group: "inline" },
  { id: "link", icon: Link2, label: t("editor.formatBar.link"), group: "inline" },
  { id: "unorderedList", icon: List, label: t("editor.formatBar.unorderedList"), group: "block" },
  { id: "orderedList", icon: ListOrdered, label: t("editor.formatBar.orderedList"), group: "block" },
  { id: "task", icon: CheckSquare, label: t("editor.formatBar.task"), group: "block" },
  { id: "quote", icon: Quote, label: t("editor.formatBar.quote"), group: "block" },
  { id: "inlineCode", icon: Code, label: t("editor.formatBar.inlineCode"), group: "inline" },
  { id: "codeBlock", icon: FileCode, label: t("editor.formatBar.codeBlock"), group: "block" },
  { id: "table", icon: Table, label: t("editor.formatBar.table"), group: "block" },
  { id: "image", icon: Image, label: t("editor.formatBar.image"), group: "insert" },
  { id: "horizontalRule", icon: Minus, label: t("editor.formatBar.horizontalRule"), group: "block" },
]);

const buttons = computed(() => {
  const order = props.toolOrder || [];
  return order
    .map((id) => {
      if (id === "formatSpacing") {
        if (!props.needsFormatSpacing || !props.enabledTools.formatSpacing) {
          return null;
        }
        return {
          id: "formatSpacing" as const,
          icon: WholeWord,
          label: t("editor.formatBar.formatSpacing"),
          group: "accent" as const,
        } as FormatBarButton;
      }

      const btn = allButtons.value.find((b: FormatBarButton) => b.id === id);
      if (btn && props.enabledTools[id]) {
        return btn;
      }
      return null;
    })
    .filter((b): b is FormatBarButton => b !== null);
});

function onButtonClick(id: MarkdownFormatToolId) {
  if (id === "formatSpacing") {
    emit("formatSpacing");
  } else {
    emit("command", id as MarkdownFormatCommand);
  }
}
</script>

<template>
  <div class="format-bar" role="toolbar" :aria-label="t('editor.formatBar.label')">
    <div class="format-tools">
      <button
        v-for="button in buttons"
        :key="button.id"
        type="button"
        class="format-btn"
        :class="[
          `format-group-${button.group}`,
          button.id === 'formatSpacing' ? 'format-btn-accent' : ''
        ]"
        :title="button.label"
        :aria-label="button.label"
        @mousedown.prevent
        @click="onButtonClick(button.id)"
      >
        <component :is="button.icon" :size="iconSize" aria-hidden="true" />
      </button>
    </div>

    <button
      type="button"
      class="format-settings-btn"
      :title="t('editor.formatBar.settings')"
      :aria-label="t('editor.formatBar.settings')"
      @mousedown.prevent
      @click="emit('openSettings')"
    >
      <Settings :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.format-bar {
  position: relative;
  z-index: 16;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 5px 12px;
  color: var(--ink-text);
  background: color-mix(in srgb, var(--ink-surface) 76%, var(--ink-bg-editor));
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.format-tools {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.format-tools::-webkit-scrollbar {
  display: none;
}

.format-btn,
.format-settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  color: var(--ink-text-muted);
  border-radius: 6px;
  transition:
    background 0.15s,
    color 0.15s,
    transform 0.15s;
}

.format-btn:hover,
.format-settings-btn:hover {
  color: var(--ink-text);
  background: var(--ink-inset-hover);
}

.format-btn:active,
.format-settings-btn:active {
  transform: translateY(1px);
}

.format-btn:focus-visible,
.format-settings-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ink-accent) 52%, transparent);
  outline-offset: 1px;
}

.format-group-inline + .format-group-block,
.format-group-block + .format-group-inline,
.format-group-block + .format-group-insert {
  margin-left: 8px;
}

.format-btn-accent {
  margin-left: 8px;
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.format-btn-accent:hover {
  color: var(--ink-accent);
  background: color-mix(in srgb, var(--ink-accent-soft) 76%, var(--ink-surface));
}

.format-settings-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  color: color-mix(in srgb, var(--ink-text-muted) 72%, transparent);
  opacity: 0.78;
}

.format-settings-btn:hover {
  opacity: 1;
}
</style>
