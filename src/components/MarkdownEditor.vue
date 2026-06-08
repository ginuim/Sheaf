<script setup lang="ts">
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import {
  SearchQuery,
  closeSearchPanel,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import { Prec, EditorSelection } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  type Panel,
} from "@codemirror/view";
import EditorSearchReplace from "./EditorSearchReplace.vue";
import { editorHighlightStyle } from "../lib/editorHighlightStyle";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../composables/useLocale";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  scroll: [];
}>();

const container = ref<HTMLElement | null>(null);
const searchReplaceRef = ref<InstanceType<typeof EditorSearchReplace> | null>(null);
const searchOpen = ref(false);
const replaceOpen = ref(false);
const { t } = useLocale();
const searchText = ref("");
const replaceText = ref("");
const caseSensitive = ref(false);
const matchTotal = ref(0);
const matchCurrent = ref(0);
let view: EditorView | null = null;
let syncing = false;

type MatchRange = { from: number; to: number };

function buildSearchQuery() {
  return new SearchQuery({
    search: searchText.value,
    replace: replaceText.value,
    caseSensitive: caseSensitive.value,
    literal: true,
  });
}

function getAllMatches(query: SearchQuery): MatchRange[] {
  if (!view) return [];
  const matches: MatchRange[] = [];
  const cursor = query.getCursor(view.state, 0, view.state.doc.length);
  for (let result = cursor.next(); !result.done; result = cursor.next()) {
    matches.push(result.value);
  }
  return matches;
}

function selectMatch(match: MatchRange) {
  if (!view) return;
  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    userEvent: "select.search",
  });
}

function refreshMatchCount() {
  if (!view || !searchText.value) {
    matchTotal.value = 0;
    matchCurrent.value = 0;
    return;
  }

  const query = buildSearchQuery();
  if (!query.valid) {
    matchTotal.value = 0;
    matchCurrent.value = 0;
    return;
  }

  const matches = getAllMatches(query);
  matchTotal.value = matches.length;

  const { from, to } = view.state.selection.main;
  const index = matches.findIndex((m) => m.from === from && m.to === to);
  matchCurrent.value = index >= 0 ? index + 1 : 0;
}

const searchCountText = computed(() => {
  if (matchTotal.value === 0) return t("search.noMatch");
  const current = matchCurrent.value > 0 ? matchCurrent.value : 0;
  return t("search.matchCount", { current, total: matchTotal.value });
});

function applySearchQuery() {
  if (!view) return;
  view.dispatch({
    effects: setSearchQuery.of(buildSearchQuery()),
  });
  refreshMatchCount();
}

function selectionIsOnMatch() {
  if (!view || !searchText.value) return false;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  return caseSensitive.value
    ? selected === searchText.value
    : selected.toLowerCase() === searchText.value.toLowerCase();
}

function focusSearchField(withReplace = false) {
  void nextTick(() => {
    if (withReplace) {
      searchReplaceRef.value?.focusReplace();
    } else {
      searchReplaceRef.value?.focusSearch();
    }
  });
}

function revealActiveMatch() {
  if (!view || !searchText.value) return;
  applySearchQuery();
  if (selectionIsOnMatch()) {
    const { from } = view.state.selection.main;
    view.dispatch({
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
  } else {
    runFindNext();
    return;
  }
  refreshMatchCount();
}

function activateSearch(withReplace = false) {
  const alreadyOpen = searchOpen.value;
  searchOpen.value = true;
  if (withReplace) replaceOpen.value = true;

  if (view) {
    ensureSearchPanelActive();
    if (!alreadyOpen) {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      if (selected && !/[\n\r]/.test(selected) && selected.length <= 200) {
        searchText.value = selected;
      }
    }
  }

  applySearchQuery();
  focusSearchField(withReplace);

  if (!view || !searchText.value) return;

  void nextTick(() => {
    if (!view) return;
    if (alreadyOpen) revealActiveMatch();
    else runFindNext();
  });
}

function openSearch(withReplace = false) {
  activateSearch(withReplace);
}

function openReplace() {
  activateSearch(true);
}

function closeSearch() {
  searchOpen.value = false;
  replaceOpen.value = false;
  searchText.value = "";
  replaceText.value = "";
  matchTotal.value = 0;
  matchCurrent.value = 0;
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
  if (!view || !searchText.value) return;
  const query = buildSearchQuery();
  if (!query.valid) return;
  const matches = getAllMatches(query);
  if (matches.length === 0) {
    refreshMatchCount();
    return;
  }
  const { from, to } = view.state.selection.main;
  const currentIndex = matches.findIndex((m) => m.from === from && m.to === to);
  const nextIndex =
    currentIndex >= 0 ? (currentIndex + 1) % matches.length : 0;
  selectMatch(matches[nextIndex]!);
  refreshMatchCount();
}

function runFindPrevious() {
  if (!view || !searchText.value) return;
  const query = buildSearchQuery();
  if (!query.valid) return;
  const matches = getAllMatches(query);
  if (matches.length === 0) {
    refreshMatchCount();
    return;
  }
  const { from, to } = view.state.selection.main;
  const currentIndex = matches.findIndex((m) => m.from === from && m.to === to);
  const prevIndex =
    currentIndex >= 0
      ? (currentIndex - 1 + matches.length) % matches.length
      : matches.length - 1;
  selectMatch(matches[prevIndex]!);
  refreshMatchCount();
}

function runReplaceNext() {
  if (!view || !searchText.value || matchTotal.value === 0) return;
  const query = buildSearchQuery();
  if (!query.valid) return;
  const matches = getAllMatches(query);
  if (matches.length === 0) return;

  const { from, to } = view.state.selection.main;
  let matchIndex = matches.findIndex((m) => m.from === from && m.to === to);
  if (matchIndex < 0) {
    matchIndex = matches.findIndex((m) => m.from >= from);
    if (matchIndex < 0) matchIndex = 0;
  }

  const match = matches[matchIndex]!;
  const insert = replaceText.value;
  view.dispatch({
    changes: { from: match.from, to: match.to, insert },
    userEvent: "input.replace",
  });

  const searchFrom = match.from + insert.length;
  const nextMatches = getAllMatches(buildSearchQuery());
  if (nextMatches.length > 0) {
    const nextMatch =
      nextMatches.find((m) => m.from >= searchFrom) ?? nextMatches[0]!;
    selectMatch(nextMatch);
  }
  refreshMatchCount();
}

function runReplaceAll() {
  if (!view || !searchText.value || matchTotal.value === 0) return;
  const query = buildSearchQuery();
  if (!query.valid) return;
  const matches = getAllMatches(query);
  if (matches.length === 0) return;
  const insert = replaceText.value;
  view.dispatch({
    changes: [...matches]
      .sort((a, b) => b.from - a.from)
      .map((m) => ({ from: m.from, to: m.to, insert })),
    userEvent: "input.replace.all",
  });
  refreshMatchCount();
}

watch([searchText, replaceText, caseSensitive], applySearchQuery);

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
    backgroundColor: "color-mix(in srgb, var(--ink-accent-soft) 45%, transparent)",
    borderRadius: "2px",
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
          if (
            searchOpen.value &&
            (update.docChanged || update.selectionSet)
          ) {
            refreshMatchCount();
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
  openReplace,
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
    <EditorSearchReplace
      v-if="searchOpen"
      ref="searchReplaceRef"
      v-model:search-text="searchText"
      v-model:replace-text="replaceText"
      v-model:case-sensitive="caseSensitive"
      v-model:replace-open="replaceOpen"
      :search-count-text="searchCountText"
      :has-matches="matchTotal > 0"
      @find-next="runFindNext"
      @find-previous="runFindPrevious"
      @replace-next="runReplaceNext"
      @replace-all="runReplaceAll"
      @close="closeSearch"
    />
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

.editor-root :deep(.cm-editor) {
  height: 100%;
  background: transparent;
  outline: none;
}

.editor-root :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
