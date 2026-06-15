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
import { EditorSelection, Prec, StateEffect, StateField } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  type Panel,
  type DecorationSet,
} from "@codemirror/view";
import EditorSearchReplace from "./EditorSearchReplace.vue";
import { editorHighlightStyle } from "../lib/editorHighlightStyle";
import {
  editorImageInsertExtension,
  insertEditorImagesFromPaths,
  type EditorImageInsertOptions,
} from "../lib/editor-image-insert";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useAppToast } from "../composables/useAppToast";
import { useLocale } from "../composables/useLocale";
import type { ProofreadIssue } from "../types/proofreading";

const props = defineProps<{
  modelValue: string;
  documentPath?: string | null;
  ensureDocumentSaved?: () => Promise<string | null>;
  proofreadIssues?: ProofreadIssue[];
  activeProofreadIssueId?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  scroll: [];
  "add-selection-context": [context: { text: string; from: number; to: number }];
  "proofread-select": [issueId: string];
  "proofread-apply": [issueId: string];
  "proofread-dismiss": [issueId: string];
}>();

const root = ref<HTMLElement | null>(null);
const container = ref<HTMLElement | null>(null);
const searchReplaceRef = ref<InstanceType<typeof EditorSearchReplace> | null>(null);
const searchOpen = ref(false);
const replaceOpen = ref(false);
const { t } = useLocale();
const { showToast } = useAppToast();

const imageInsertOptions: EditorImageInsertOptions = {
  getDocumentPath: () => props.documentPath ?? null,
  ensureDocumentSaved: () => props.ensureDocumentSaved?.() ?? Promise.resolve(null),
  onRequiresSavedDocument: () => {
    showToast("info", t("editor.imageRequiresSavedDocument"));
  },
  onInsertFailed: () => {
    showToast("error", t("editor.imageInsertFailed"));
  },
};
const searchText = ref("");
const replaceText = ref("");
const caseSensitive = ref(false);
const matchTotal = ref(0);
const matchCurrent = ref(0);
const proofreadPopoverStyle = ref<Record<string, string> | null>(null);
const selectionContextMenu = ref<{
  text: string;
  from: number;
  to: number;
  left: number;
  top: number;
} | null>(null);
let view: EditorView | null = null;
let syncing = false;
let proofreadPopoverFrame = 0;

type MatchRange = { from: number; to: number };
type ProofreadDecorationPayload = {
  issues: ProofreadIssue[];
  activeId: string | null;
};

const setProofreadDecorationsEffect =
  StateEffect.define<ProofreadDecorationPayload>();

function buildProofreadDecorations(payload: ProofreadDecorationPayload, docLength: number) {
  const ranges = payload.issues
    .filter((issue) =>
      issue.status !== "applied" &&
      issue.status !== "ignored" &&
      issue.from >= 0 &&
      issue.to > issue.from &&
      issue.to <= docLength,
    )
    .sort((left, right) => left.from - right.from)
    .map((issue) =>
      Decoration.mark({
        class: [
          "cm-proofread-issue",
          issue.id === payload.activeId ? "cm-proofread-issue-active" : "",
        ].filter(Boolean).join(" "),
        attributes: {
          "data-proofread-id": issue.id,
          title: `${issue.original} -> ${issue.suggestion}`,
        },
      }).range(issue.from, issue.to),
    );

  return Decoration.set(ranges, true);
}

const proofreadDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setProofreadDecorationsEffect)) {
        next = buildProofreadDecorations(effect.value, transaction.state.doc.length);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

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

const activeProofreadIssue = computed(() => {
  const activeId = props.activeProofreadIssueId;
  if (!activeId) return null;
  return (props.proofreadIssues ?? []).find(
    (issue) =>
      issue.id === activeId &&
      issue.status !== "applied" &&
      issue.status !== "ignored",
  ) ?? null;
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

function syncProofreadDecorations() {
  if (!view) return;
  view.dispatch({
    effects: setProofreadDecorationsEffect.of({
      issues: props.proofreadIssues ?? [],
      activeId: props.activeProofreadIssueId ?? null,
    }),
  });
  updateProofreadPopover();
}

function updateProofreadPopover() {
  const issue = activeProofreadIssue.value;
  if (!view || !root.value || !issue) {
    proofreadPopoverStyle.value = null;
    return;
  }

  const fromCoords = view.coordsAtPos(issue.from);
  const toCoords = view.coordsAtPos(issue.to);
  if (!fromCoords) {
    proofreadPopoverStyle.value = null;
    return;
  }

  const rootRect = root.value.getBoundingClientRect();
  const issueTop = fromCoords.top;
  const issueBottom = Math.max(fromCoords.bottom, toCoords?.bottom ?? fromCoords.bottom);
  if (issueBottom < rootRect.top + 8 || issueTop > rootRect.bottom - 8) {
    proofreadPopoverStyle.value = null;
    return;
  }

  const width = 236;
  const left = Math.min(
    Math.max(12, fromCoords.left - rootRect.left - 18),
    Math.max(12, rootRect.width - width - 12),
  );
  const belowTop = issueBottom - rootRect.top + 10;
  const aboveTop = issueTop - rootRect.top - 148;
  const top = belowTop + 148 <= rootRect.height - 12
    ? belowTop
    : Math.max(12, aboveTop);

  proofreadPopoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  };
}

function scheduleProofreadPopoverUpdate() {
  if (proofreadPopoverFrame) cancelAnimationFrame(proofreadPopoverFrame);
  proofreadPopoverFrame = requestAnimationFrame(() => {
    proofreadPopoverFrame = 0;
    updateProofreadPopover();
  });
}

function selectProofreadIssue(issueId: string) {
  const issue = (props.proofreadIssues ?? []).find(
    (item) =>
      item.id === issueId &&
      item.status !== "applied" &&
      item.status !== "ignored",
  );
  if (!view || !issue) return;

  emit("proofread-select", issue.id);
  view.dispatch({
    selection: EditorSelection.single(issue.from, issue.to),
    effects: EditorView.scrollIntoView(issue.from, { y: "center", yMargin: 80 }),
    userEvent: "select.proofread",
  });
  void nextTick(scheduleProofreadPopoverUpdate);
}

function handleEditorScroll() {
  emit("scroll");
  scheduleProofreadPopoverUpdate();
}

function handleProofreadClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  const marker = target.closest<HTMLElement>(".cm-proofread-issue");
  const issueId = marker?.dataset.proofreadId;
  if (!issueId) return false;

  event.preventDefault();
  selectProofreadIssue(issueId);
  return true;
}

function closeSelectionContextMenu() {
  selectionContextMenu.value = null;
}

function handleEditorContextMenu(event: MouseEvent) {
  if (!view || !root.value) return false;

  const selection = view.state.selection.main;
  if (selection.empty) {
    closeSelectionContextMenu();
    return false;
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const text = view.state.sliceDoc(from, to).trim();
  if (!text) {
    closeSelectionContextMenu();
    return false;
  }

  event.preventDefault();
  const rootRect = root.value.getBoundingClientRect();
  selectionContextMenu.value = {
    text,
    from,
    to,
    left: Math.min(Math.max(8, event.clientX - rootRect.left), Math.max(8, rootRect.width - 220)),
    top: Math.min(Math.max(8, event.clientY - rootRect.top), Math.max(8, rootRect.height - 48)),
  };
  return true;
}

function addSelectionToContext() {
  const context = selectionContextMenu.value;
  if (!context) return;
  emit("add-selection-context", {
    text: context.text,
    from: context.from,
    to: context.to,
  });
  closeSelectionContextMenu();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!selectionContextMenu.value) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest(".selection-context-menu")) return;
  closeSelectionContextMenu();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeSelectionContextMenu();
}

watch([searchText, replaceText, caseSensitive], applySearchQuery);
watch(
  [() => props.proofreadIssues, () => props.activeProofreadIssueId],
  () => syncProofreadDecorations(),
  { deep: true },
);
watch(activeProofreadIssue, () => {
  void nextTick(scheduleProofreadPopoverUpdate);
});

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
        proofreadDecorationField,
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
        EditorView.domEventHandlers({
          click: handleProofreadClick,
          contextmenu: handleEditorContextMenu,
        }),
        editorImageInsertExtension(imageInsertOptions),
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
          if (update.geometryChanged || update.viewportChanged) {
            scheduleProofreadPopoverUpdate();
          }
          if (update.docChanged || update.selectionSet) {
            closeSelectionContextMenu();
          }
        }),
      ],
    }),
    parent: container.value,
  });

  syncProofreadDecorations();
  view.scrollDOM.addEventListener("scroll", handleEditorScroll, { passive: true });
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  if (proofreadPopoverFrame) cancelAnimationFrame(proofreadPopoverFrame);
  view?.scrollDOM.removeEventListener("scroll", handleEditorScroll);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
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

function insertDroppedImagePaths(paths: string[]) {
  if (!view || paths.length === 0) return;

  const insertPos = view.state.selection.main.head;
  void insertEditorImagesFromPaths(view, insertPos, paths, imageInsertOptions);
}

defineExpose({
  openSearch,
  openReplace,
  closeSearch,
  isSearchOpen: () => searchOpen.value,
  insertDroppedImagePaths,
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
  revealProofreadIssue(issueId: string) {
    selectProofreadIssue(issueId);
  },
});
</script>

<template>
  <div ref="root" class="editor-root">
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
    <div
      v-if="selectionContextMenu"
      class="selection-context-menu"
      :style="{ left: `${selectionContextMenu.left}px`, top: `${selectionContextMenu.top}px` }"
      role="menu"
    >
      <button
        type="button"
        class="selection-context-menu-item"
        role="menuitem"
        @click="addSelectionToContext"
      >
        {{ t("editor.addSelectionToAiContext") }}
      </button>
    </div>
    <div
      v-if="activeProofreadIssue && proofreadPopoverStyle"
      class="proofread-popover"
      :style="proofreadPopoverStyle"
    >
      <div class="proofread-popover-label">{{ t("proofread.fixLabel") }}</div>
      <button
        type="button"
        class="proofread-suggestion"
        @click="emit('proofread-apply', activeProofreadIssue.id)"
      >
        {{ activeProofreadIssue.suggestion }}
      </button>
      <div v-if="activeProofreadIssue.reason" class="proofread-reason">
        {{ activeProofreadIssue.reason }}
      </div>
      <button
        type="button"
        class="proofread-ignore"
        @click="emit('proofread-dismiss', activeProofreadIssue.id)"
      >
        {{ t("proofread.ignore") }}
      </button>
    </div>
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

.editor-root :deep(.cm-proofread-issue) {
  background: color-mix(in srgb, #e53e3e 14%, transparent);
  border-radius: 2px;
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: #e53e3e;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
  cursor: pointer;
}

.editor-root :deep(.cm-proofread-issue-active) {
  background: color-mix(in srgb, #e53e3e 24%, transparent);
  outline: 1px solid color-mix(in srgb, #e53e3e 58%, transparent);
}

.selection-context-menu {
  position: absolute;
  z-index: 40;
  min-width: 190px;
  padding: 5px;
  border: 1px solid var(--ink-border-strong);
  border-radius: 8px;
  background: var(--ink-surface);
  box-shadow: 0 14px 34px color-mix(in srgb, var(--ink-shadow) 42%, transparent);
}

.selection-context-menu-item {
  display: block;
  width: 100%;
  padding: 7px 9px;
  color: var(--ink-text);
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  text-align: left;
  border: 0;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}

.selection-context-menu-item:hover {
  background: var(--ink-inset-hover);
}

.proofread-popover {
  position: absolute;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  color: var(--ink-text);
  border: 1px solid var(--ink-border-strong);
  border-radius: 8px;
  background: var(--ink-surface);
  box-shadow: 0 16px 36px color-mix(in srgb, var(--ink-shadow) 42%, transparent);
}

.proofread-popover-label {
  color: var(--ink-text-muted);
  font-size: 11px;
  font-weight: 650;
}

.proofread-suggestion {
  width: 100%;
  padding: 6px 0;
  color: #2f855a;
  font: inherit;
  font-size: 15px;
  font-weight: 750;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
}

.proofread-suggestion:hover {
  color: #276749;
}

.proofread-reason {
  color: var(--ink-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.proofread-ignore {
  width: 100%;
  padding: 8px 0 2px;
  color: var(--ink-text-muted);
  font: inherit;
  font-size: 12px;
  text-align: left;
  border: none;
  border-top: 1px solid var(--ink-border);
  background: transparent;
  cursor: pointer;
}

.proofread-ignore:hover {
  color: var(--ink-text);
}
</style>
