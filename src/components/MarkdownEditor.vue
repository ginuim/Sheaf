<script setup lang="ts">
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { editorHighlightStyle } from "../lib/editorHighlightStyle";
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  scroll: [];
}>();

const container = ref<HTMLElement | null>(null);
let view: EditorView | null = null;
let syncing = false;

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    fontFamily: "var(--font-editor)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "1.75",
  },
  ".cm-content": {
    padding: "2.5rem 0",
    caretColor: "var(--ink-accent)",
    maxWidth: "var(--content-max)",
    margin: "0 auto",
    paddingLeft: "2rem",
    paddingRight: "2rem",
    color: "var(--ink-text)",
  },
  ".cm-line": {
    padding: "0 2px",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--ink-text-muted)",
    opacity: "0.55",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--ink-text-muted)",
    opacity: "1",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--ink-accent-soft)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--ink-accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--ink-selection) !important",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.5rem",
    textAlign: "right",
    fontSize: "12px",
    paddingTop: "1px",
  },
});

onMounted(() => {
  if (!container.value) return;

  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        markdown(),
        syntaxHighlighting(editorHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        editorTheme,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncing) {
            emit("update:modelValue", update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: container.value,
  });

  view.scrollDOM.addEventListener("scroll", () => emit("scroll"), { passive: true });
});

onUnmounted(() => {
  view?.destroy();
});

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      syncing = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      syncing = false;
    }
  },
);

defineExpose({
  scrollRatio(ratio: number) {
    if (!view) return;
    const scroller = view.scrollDOM;
    const max = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTop = max * ratio;
  },
  getScrollRatio(): number {
    if (!view) return 0;
    const scroller = view.scrollDOM;
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 0) return 0;
    return scroller.scrollTop / max;
  },
  scrollToLine(line: number) {
    if (!view) return;
    const docLine = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
    view.dispatch({
      effects: EditorView.scrollIntoView(docLine.from, { y: "start", yMargin: 80 }),
    });
  },
  applyChanges(changes: Array<{ from: number; to: number; insert: string }>) {
    if (!view || changes.length === 0) return;
    view.dispatch({ changes });
  },
});
</script>

<template>
  <div ref="container" class="editor-root" />
</template>

<style scoped>
.editor-root {
  height: 100%;
  background: var(--ink-bg-editor);
  overflow: hidden;
}

.editor-root :deep(.cm-editor) {
  height: 100%;
  background: transparent;
  outline: none;
}

.editor-root :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
