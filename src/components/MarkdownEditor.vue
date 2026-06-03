<script setup lang="ts">
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import { Prec } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  type Panel,
} from "@codemirror/view";
import { editorHighlightStyle } from "../lib/editorHighlightStyle";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  scroll: [];
}>();

const container = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchOpen = ref(false);
const searchText = ref("");
const caseSensitive = ref(false);
let view: EditorView | null = null;
let syncing = false;

function applySearchQuery() {
  if (!view) return;
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: searchText.value,
        caseSensitive: caseSensitive.value,
        literal: true,
      }),
    ),
  });
}

function openSearch() {
  searchOpen.value = true;
  if (view) {
    ensureSearchPanelActive();
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    if (selected && !/[\n\r]/.test(selected) && selected.length <= 200) {
      searchText.value = selected;
    }
  }
  applySearchQuery();
  void nextTick(() => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    if (view && searchText.value) findNext(view);
  });
}

function closeSearch() {
  searchOpen.value = false;
  searchText.value = "";
  if (!view) return;
  closeSearchPanel(view);
  view.dispatch({
    effects: setSearchQuery.of(new SearchQuery({ search: "" })),
  });
}

/** 启用 CM 搜索高亮；面板 DOM 隐藏，UI 仍用 Vue 搜索栏 */
function createHiddenSearchPanel(): Panel {
  const dom = document.createElement("div");
  dom.hidden = true;
  dom.setAttribute("aria-hidden", "true");
  return { dom, top: true };
}

function ensureSearchPanelActive() {
  if (!view || searchPanelOpen(view.state)) return;
  openSearchPanel(view);
}

function runFindNext() {
  if (view) findNext(view);
}

function runFindPrevious() {
  if (view) findPrevious(view);
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) runFindPrevious();
    else runFindNext();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeSearch();
  }
}

watch([searchText, caseSensitive], applySearchQuery);

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
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--ink-accent) 20%, transparent)",
    borderRadius: "2px",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, #c45c26 38%, var(--ink-bg-editor))",
    outline: "1px solid color-mix(in srgb, #c45c26 70%, transparent)",
    borderRadius: "2px",
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
        search({ createPanel: createHiddenSearchPanel, top: true }),
        Prec.highest(
          keymap.of([
            {
              key: "Mod-f",
              run: () => {
                openSearch();
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                if (!searchOpen.value) return false;
                closeSearch();
                return true;
              },
            },
          ]),
        ),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
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
  openSearch,
  closeSearch,
  isSearchOpen: () => searchOpen.value,
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
  <div class="editor-root">
    <div
      v-if="searchOpen"
      class="search-bar"
      role="search"
      aria-label="在文档中搜索"
      @keydown.stop
    >
      <input
        ref="searchInputRef"
        v-model="searchText"
        class="search-input"
        type="search"
        placeholder="搜索…"
        autocomplete="off"
        spellcheck="false"
        @keydown="onSearchKeydown"
      />
      <label class="search-option">
        <input v-model="caseSensitive" type="checkbox" />
        <span>区分大小写</span>
      </label>
      <button
        type="button"
        class="search-btn"
        title="上一个 (⇧Enter)"
        @click="runFindPrevious"
      >
        ↑
      </button>
      <button
        type="button"
        class="search-btn"
        title="下一个 (Enter)"
        @click="runFindNext"
      >
        ↓
      </button>
      <button
        type="button"
        class="search-close"
        title="关闭 (Esc)"
        aria-label="关闭搜索"
        @click="closeSearch"
      >
        ×
      </button>
    </div>
    <div ref="container" class="editor-container" />
  </div>
</template>

<style scoped>
.editor-root {
  position: relative;
  height: 100%;
  background: var(--ink-bg-editor);
  overflow: hidden;
}

.editor-container {
  height: 100%;
}

.search-bar {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--ink-shadow);
}

.search-input {
  width: 180px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--ink-text);
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 6px;
}

.search-input:focus {
  outline: none;
  border-color: var(--ink-accent);
}

.search-option {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-text-muted);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.search-btn,
.search-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 14px;
  color: var(--ink-text-muted);
  border-radius: 6px;
}

.search-btn:hover,
.search-close:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.search-close {
  font-size: 18px;
  line-height: 1;
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
