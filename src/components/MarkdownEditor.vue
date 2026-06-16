<script setup lang="ts">
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
import MarkdownFormatBar from "./MarkdownFormatBar.vue";
import { editorHighlightStyle } from "../lib/editorHighlightStyle";
import {
  editorImageInsertExtension,
  insertEditorImagesFromPaths,
  type EditorImageInsertOptions,
} from "../lib/editor-image-insert";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { GitCompare, CheckCircle2, X } from "@lucide/vue";
import { applyChangesToDoc, lineDiff } from "../composables/useAI";
import { useAppToast } from "../composables/useAppToast";
import { useLocale } from "../composables/useLocale";
import type { ProofreadIssue } from "../types/proofreading";
import {
  markdownFormatToolIds,
  type MarkdownFormatCommand,
  type MarkdownFormatToolId,
} from "../types/markdown-format";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    documentPath?: string | null;
    ensureDocumentSaved?: () => Promise<string | null>;
    proofreadIssues?: ProofreadIssue[];
    activeProofreadIssueId?: string | null;
    previewDiffItem?: any;
    formatBarEnabled?: boolean;
    needsFormatSpacing?: boolean;
    formatBarTools?: Partial<Record<MarkdownFormatToolId, boolean>>;
    formatBarToolOrder?: MarkdownFormatToolId[];
  }>(),
  {
    formatBarEnabled: true,
    needsFormatSpacing: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  scroll: [];
  "add-selection-context": [context: { text: string; from: number; to: number }];
  "proofread-select": [issueId: string];
  "proofread-apply": [issueId: string];
  "proofread-dismiss": [issueId: string];
  "accept-preview": [item: any];
  "discard-preview": [];
  "format-spacing": [];
  "open-format-settings": [];
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
type ScrollAnchor = {
  line: number;
  lineEnd: number;
  offsetRatio: number;
  absoluteRatio: number;
};
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

const enabledFormatBarTools = computed(() =>
  Object.fromEntries(
    markdownFormatToolIds.map((id) => [id, props.formatBarTools?.[id] !== false]),
  ) as Record<MarkdownFormatToolId, boolean>,
);

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

function editorPlaceholder(key: string) {
  return t(`editor.placeholders.${key}`);
}

function dispatchEditorChange(
  from: number,
  to: number,
  insert: string,
  selectionFrom: number,
  selectionTo = selectionFrom,
  userEvent = "input.markdown-format",
) {
  if (!view) return;

  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.single(selectionFrom, selectionTo),
    scrollIntoView: true,
    userEvent,
  });
  view.focus();
}

function selectedText() {
  if (!view) return "";
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

function applyInlineWrap(prefix: string, suffix: string, placeholderKey = "text") {
  if (!view) return;

  const { from, to } = view.state.selection.main;
  const selected = selectedText();
  const text = selected || editorPlaceholder(placeholderKey);
  const insert = `${prefix}${text}${suffix}`;
  const selectionFrom = from + prefix.length;
  const selectionTo = selectionFrom + text.length;

  dispatchEditorChange(from, to, insert, selectionFrom, selectionTo);
}

function applyLinkFormat() {
  if (!view) return;

  const { from, to } = view.state.selection.main;
  const selected = selectedText();
  const text = selected && !/[\r\n]/.test(selected)
    ? selected
    : editorPlaceholder("linkText");
  const url = editorPlaceholder("linkUrl");
  const insert = `[${text}](${url})`;
  const textStart = from + 1;
  const urlStart = from + text.length + 3;

  if (selected && !/[\r\n]/.test(selected)) {
    dispatchEditorChange(from, to, insert, urlStart, urlStart + url.length);
    return;
  }

  dispatchEditorChange(from, to, insert, textStart, textStart + text.length);
}

function applyImagePlaceholder() {
  if (!view) return;

  const { from, to } = view.state.selection.main;
  const selected = selectedText();
  const alt = selected && !/[\r\n]/.test(selected)
    ? selected
    : editorPlaceholder("imageAlt");
  const path = editorPlaceholder("imagePath");
  const insert = `![${alt}](${path})`;
  const pathStart = from + alt.length + 4;

  dispatchEditorChange(from, to, insert, pathStart, pathStart + path.length);
}

function stripBlockPrefix(text: string) {
  return text.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, "");
}

function applyHeadingFormat(level: number) {
  if (!view) return;

  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const content = stripBlockPrefix(line.text).trimEnd() ||
    editorPlaceholder("heading");
  const prefix = `${"#".repeat(level)} `;
  const insert = `${prefix}${content}`;
  const selectionFrom = line.from + prefix.length;

  dispatchEditorChange(
    line.from,
    line.to,
    insert,
    selectionFrom,
    selectionFrom + content.length,
  );
}

function selectionLineRange() {
  if (!view) return null;

  const selection = view.state.selection.main;
  const startLine = view.state.doc.lineAt(selection.from);
  const endPos = selection.empty
    ? selection.to
    : Math.max(selection.from, selection.to - 1);
  const endLine = view.state.doc.lineAt(endPos);

  return { selection, startLine, endLine };
}

function applyLinePrefixFormat(command: "unorderedList" | "orderedList" | "quote" | "task") {
  if (!view) return;

  const range = selectionLineRange();
  if (!range) return;

  const { selection, startLine, endLine } = range;
  const lines = [];
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    lines.push(view.state.doc.line(lineNumber));
  }

  const noSelection = selection.empty;
  const replacementLines = lines.map((line, index) => {
    const fallback = command === "quote"
      ? editorPlaceholder("quote")
      : editorPlaceholder("listItem");
    const content = stripBlockPrefix(line.text) ||
      (noSelection && index === 0 ? fallback : "");
    if (command === "orderedList") return `${index + 1}. ${content}`;
    if (command === "quote") return `> ${content}`;
    if (command === "task") return `- [ ] ${content}`;
    return `- ${content}`;
  });
  const insert = replacementLines.join("\n");
  const firstPrefixLength = command === "orderedList" ? 3 : (command === "task" ? 6 : 2);
  const selectionFrom = startLine.from + firstPrefixLength;
  const selectionTo = noSelection
    ? selectionFrom + replacementLines[0]!.slice(firstPrefixLength).length
    : startLine.from + insert.length;

  dispatchEditorChange(startLine.from, endLine.to, insert, selectionFrom, selectionTo);
}

function applyCodeBlockFormat() {
  if (!view) return;

  const { from, to } = view.state.selection.main;
  const selected = selectedText();
  const code = selected || editorPlaceholder("code");
  const insert = `\`\`\`\n${code}\n\`\`\``;
  const selectionFrom = from + 4;

  dispatchEditorChange(from, to, insert, selectionFrom, selectionFrom + code.length);
}

function selectedDialogPaths(value: string | string[] | null): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isSupportedImagePath(path: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|heic|heif)$/i.test(path);
}

async function applyImageFormat() {
  if (!view) return;

  if (!isTauri()) {
    applyImagePlaceholder();
    return;
  }

  try {
    const selected = await openDialog({
      multiple: true,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic", "heif"],
        },
      ],
    });
    const paths = selectedDialogPaths(selected).filter(isSupportedImagePath);
    if (paths.length === 0) {
      if (selected) showToast("info", t("editor.imageSelectInvalid"));
      return;
    }

    await invoke("allow_dropped_paths", { paths });
    await insertEditorImagesFromPaths(
      view,
      view.state.selection.main.head,
      paths,
      imageInsertOptions,
    );
  } catch {
    showToast("error", t("editor.imageSelectFailed"));
  }
}

function applyHorizontalRuleFormat() {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const insert = "\n---\n";
  dispatchEditorChange(from, to, insert, from + insert.length);
}

function applyTableFormat() {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const insert = "\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n";
  dispatchEditorChange(from, to, insert, from + insert.length);
}

function handleFormatCommand(command: MarkdownFormatCommand) {
  if (!view) return;

  closeSelectionContextMenu();

  if (command === "heading1") applyHeadingFormat(1);
  else if (command === "heading2") applyHeadingFormat(2);
  else if (command === "heading3") applyHeadingFormat(3);
  else if (command === "heading4") applyHeadingFormat(4);
  else if (command === "bold") applyInlineWrap("**", "**");
  else if (command === "italic") applyInlineWrap("*", "*");
  else if (command === "strikethrough") applyInlineWrap("~~", "~~");
  else if (command === "link") applyLinkFormat();
  else if (command === "unorderedList") applyLinePrefixFormat(command);
  else if (command === "orderedList") applyLinePrefixFormat(command);
  else if (command === "task") applyLinePrefixFormat(command);
  else if (command === "quote") applyLinePrefixFormat(command);
  else if (command === "inlineCode") applyInlineWrap("`", "`", "code");
  else if (command === "codeBlock") applyCodeBlockFormat();
  else if (command === "table") applyTableFormat();
  else if (command === "image") void applyImageFormat();
  else if (command === "horizontalRule") applyHorizontalRuleFormat();
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

watch(
  () => props.previewDiffItem,
  async (newVal: any) => {
    if (!newVal) {
      await nextTick();
      if (view) {
        view.focus();
        view.requestMeasure();
      }
    }
  },
);

const previewDiffLines = computed(() => {
  if (!props.previewDiffItem) return [];
  const oldStr = props.previewDiffItem.originalDoc;
  const newStr = applyChangesToDoc(oldStr, props.previewDiffItem.changes);
  const diffs = lineDiff(oldStr, newStr);

  let oldLineNum = 1;
  let newLineNum = 1;

  const fullLines = diffs.map((line) => {
    let currentOld: number | null = null;
    let currentNew: number | null = null;
    let sign = " ";

    if (line.type === "normal") {
      currentOld = oldLineNum++;
      currentNew = newLineNum++;
    } else if (line.type === "removed") {
      currentOld = oldLineNum++;
      sign = "-";
    } else if (line.type === "added") {
      currentNew = newLineNum++;
      sign = "+";
    }

    return {
      type: line.type,
      text: line.text,
      oldLineNum: currentOld,
      newLineNum: currentNew,
      sign,
    };
  });

  const contextLines = 3;
  const n = fullLines.length;
  const shouldShow = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (fullLines[i].type === "added" || fullLines[i].type === "removed") {
      shouldShow[i] = true;
      for (let j = 1; j <= contextLines; j++) {
        if (i - j >= 0) shouldShow[i - j] = true;
        if (i + j < n) shouldShow[i + j] = true;
      }
    }
  }

  const result: Array<{
    type: "normal" | "added" | "removed" | "ellipsis";
    text: string;
    oldLineNum: number | null;
    newLineNum: number | null;
    sign: string;
  }> = [];

  let inEllipsis = false;
  for (let i = 0; i < n; i++) {
    if (shouldShow[i]) {
      inEllipsis = false;
      result.push(fullLines[i]);
    } else {
      if (!inEllipsis) {
        let count = 0;
        for (let k = i; k < n; k++) {
          if (!shouldShow[k]) count++;
          else break;
        }
        result.push({
          type: "ellipsis",
          text: `... 省略 ${count} 行相同内容 ...`,
          oldLineNum: null,
          newLineNum: null,
          sign: " ",
        });
        inEllipsis = true;
      }
    }
  }

  return result;
});

function insertDroppedImagePaths(paths: string[]) {
  if (!view || paths.length === 0) return;

  const insertPos = view.state.selection.main.head;
  void insertEditorImagesFromPaths(view, insertPos, paths, imageInsertOptions);
}

function getEditorScrollRatio(): number {
  if (!view) return 0;

  const scroller = view.scrollDOM;
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (max <= 0) return 0;

  const padding = view.documentPadding;
  if (scroller.scrollTop <= padding.top + 1) return 0;
  if (scroller.scrollTop >= max - padding.bottom - 1) return 1;

  const scrollable = Math.max(max - padding.top - padding.bottom, 1);
  return Math.min(Math.max((scroller.scrollTop - padding.top) / scrollable, 0), 1);
}

function setEditorScrollRatio(ratio: number) {
  if (!view) return;

  const scroller = view.scrollDOM;
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (max <= 0) {
    scroller.scrollTop = 0;
    return;
  }

  if (ratio <= 0) {
    scroller.scrollTop = 0;
    return;
  }
  if (ratio >= 1) {
    scroller.scrollTop = max;
    return;
  }

  const padding = view.documentPadding;
  const scrollable = Math.max(max - padding.top - padding.bottom, 1);
  scroller.scrollTop = padding.top + scrollable * ratio;
}

function getScrollAnchor(): ScrollAnchor | null {
  if (!view) return null;

  const scroller = view.scrollDOM;
  const viewportTop = scroller.getBoundingClientRect().top;
  const documentHeightAtTop = Math.max(0, viewportTop - view.documentTop + 1);
  const block = view.lineBlockAtHeight(documentHeightAtTop);
  const line = view.state.doc.lineAt(block.from);

  return {
    line: line.number - 1,
    lineEnd: line.number - 1,
    offsetRatio: 0,
    absoluteRatio: getEditorScrollRatio(),
  };
}

function scrollToSourceAnchor(anchor: ScrollAnchor) {
  if (!view) return false;

  const lineNumber = Math.min(
    Math.max(Math.floor(anchor.line) + 1, 1),
    view.state.doc.lines,
  );
  const line = view.state.doc.line(lineNumber);
  const block = view.lineBlockAt(line.from);
  const scroller = view.scrollDOM;
  const offsetRatio = anchor.line === anchor.lineEnd ? 0 : anchor.offsetRatio;
  const targetHeight =
    block.top + block.height * Math.min(Math.max(offsetRatio, 0), 1);
  const targetScreenTop = view.documentTop + targetHeight;
  const scrollerTop = scroller.getBoundingClientRect().top;
  scroller.scrollTop = Math.max(0, scroller.scrollTop + targetScreenTop - scrollerTop);
  return true;
}

defineExpose({
  openSearch,
  openReplace,
  closeSearch,
  isSearchOpen: () => searchOpen.value,
  insertDroppedImagePaths,
  getScrollAnchor,
  scrollToSourceAnchor,
  scrollRatio(ratio: number) {
    setEditorScrollRatio(ratio);
  },
  getScrollRatio(): number {
    return getEditorScrollRatio();
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
  <div
    ref="root"
    class="editor-root"
    :class="{ 'has-format-bar': props.formatBarEnabled && !props.previewDiffItem }"
  >
    <MarkdownFormatBar
      v-if="props.formatBarEnabled && !props.previewDiffItem"
      :needs-format-spacing="props.needsFormatSpacing"
      :enabled-tools="enabledFormatBarTools"
      :tool-order="props.formatBarToolOrder || []"
      @command="handleFormatCommand"
      @format-spacing="emit('format-spacing')"
      @open-settings="emit('open-format-settings')"
    />
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
    <div v-show="!props.previewDiffItem" ref="container" class="editor-container" />

    <div v-if="props.previewDiffItem" class="diff-preview-container">
      <div class="diff-preview-header">
        <div class="diff-preview-title-group">
          <GitCompare :size="16" class="diff-preview-icon" />
          <span class="diff-preview-title">{{ t("ai.previewingDiff") }}</span>
        </div>
        <div class="diff-preview-actions">
          <button class="diff-preview-btn accept" @click="emit('accept-preview', props.previewDiffItem)">
            <CheckCircle2 :size="14" />
            {{ t("ai.acceptPreview") }}
          </button>
          <button class="diff-preview-btn discard" @click="emit('discard-preview')">
            <X :size="14" />
            {{ t("ai.discardPreview") }}
          </button>
        </div>
      </div>
      <div class="diff-preview-body">
        <div class="diff-preview-lines">
          <div
            v-for="(line, idx) in previewDiffLines"
            :key="idx"
            :class="['diff-preview-line', `diff-type-${line.type}`]"
          >
            <span class="diff-line-num old-num">{{ line.oldLineNum || '' }}</span>
            <span class="diff-line-num new-num">{{ line.newLineNum || '' }}</span>
            <span class="diff-line-sign">{{ line.sign }}</span>
            <span class="diff-line-content">{{ line.text }}</span>
          </div>
        </div>
      </div>
    </div>
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
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ink-bg-editor);
  overflow: hidden;
}

.editor-container {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.editor-root.has-format-bar :deep(.search-bar) {
  top: 54px;
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

.diff-preview-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ink-bg-editor);
  color: var(--ink-text);
}

.diff-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--ink-surface);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.diff-preview-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 13px;
  color: var(--ink-text);
}

.diff-preview-icon {
  color: var(--ink-text-muted);
}

.diff-preview-actions {
  display: flex;
  gap: 8px;
}

.diff-preview-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.diff-preview-btn.accept {
  background: var(--ink-accent);
  color: var(--ink-bg);
}

.diff-preview-btn.accept:hover {
  opacity: 0.9;
}

.diff-preview-btn.discard {
  background: transparent;
  border-color: var(--ink-border);
  color: var(--ink-text-muted);
}

.diff-preview-btn.discard:hover {
  background: var(--ink-surface-hover);
  color: var(--ink-text);
}

.diff-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.diff-preview-lines {
  display: flex;
  flex-direction: column;
}

.diff-preview-line {
  display: flex;
  padding: 2px 0;
  font-family: var(--font-editor);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.diff-line-num {
  flex-shrink: 0;
  width: 40px;
  text-align: right;
  padding-right: 8px;
  user-select: none;
  color: var(--ink-text-muted);
  font-size: 10px;
  opacity: 0.6;
}

.diff-line-num.old-num {
  border-right: none;
}

.diff-line-num.new-num {
  border-right: 1px solid var(--ink-border);
  margin-right: 8px;
}

.diff-line-sign {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  user-select: none;
  font-weight: bold;
  opacity: 0.75;
}

.diff-line-content {
  flex: 1;
  padding-right: 16px;
}

.diff-preview-line.diff-type-removed {
  color: #c53030;
  background: color-mix(in srgb, #e53e3e 9%, transparent);
}

.diff-preview-line.diff-type-removed .diff-line-num {
  color: #c53030;
}

.diff-preview-line.diff-type-added {
  color: #2f855a;
  background: color-mix(in srgb, #38a169 10%, transparent);
}

.diff-preview-line.diff-type-added .diff-line-num {
  color: #2f855a;
}

.diff-preview-line.diff-type-normal {
  color: var(--ink-text);
}

.diff-preview-line.diff-type-ellipsis {
  justify-content: center;
  padding: 6px 0;
  color: var(--ink-text-muted);
  font-size: 11px;
  font-style: italic;
  background: color-mix(in srgb, var(--ink-bg) 82%, var(--ink-surface));
  opacity: 0.75;
}
</style>
