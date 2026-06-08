<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import {
  Bot,
  Clock3,
  GitCompare,
  Plus,
  Send,
  Square,
  Trash2,
} from "@lucide/vue";
import {
  explainNoChanges,
  useAI,
  applyChangesToDoc,
  isFullDocChange,
  lineDiff,
  compressDiff,
  summarizeItemDiff,
  isBlankToAiEdit,
  buildAgentHistoryFromItems,
  type AgentActivity,
  type AIHistoryMode,
  type EditChange,
  type AIHistoryItem,
} from "../composables/useAI";
import { useDocumentVersions } from "../composables/useDocumentVersions";
import { useLocale } from "../composables/useLocale";
import AgentActivityList from "./AgentActivityList.vue";

const { t } = useLocale();

const iconSize = 14;
const DEFAULT_PANEL_WIDTH = 320;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 560;
const PANEL_WIDTH_STORAGE_KEY = "sheaf:ai-panel-width";

const props = defineProps<{
  doc: string;
  documentKey?: string | null;
  documentPath?: string | null;
  workspacePaths?: string[];
  readWorkspaceFile?: (path: string) => Promise<string>;
}>();

const emit = defineEmits<{
  apply: [changes: EditChange[]];
  restore: [content: string];
}>();

const resolvedDocumentKey = computed(() => props.documentKey?.trim() || "__untitled__");
const {
  streamEdit,
  runAgent,
  historyList,
  activeConversationId,
  conversationSummaries,
  startNewConversation,
  switchConversation,
  clearAllConversations,
} = useAI(() => resolvedDocumentKey.value);
const documentVersions = useDocumentVersions(() => resolvedDocumentKey.value);

const aiMode = ref<AIHistoryMode>("agent");
const instruction = ref("");
const listRef = ref<HTMLElement | null>(null);
const expandedDiffId = ref<string | null>(null);
const panelWidth = ref(DEFAULT_PANEL_WIDTH);
const isResizing = ref(false);
let activeAbortController: AbortController | null = null;
let imeComposing = false;
let resizeStartX = 0;
let resizeStartWidth = DEFAULT_PANEL_WIDTH;
let previousBodyCursor = "";
let previousBodyUserSelect = "";

const isLoading = computed(() => historyList.value.some((item: AIHistoryItem) => item.status === "loading"));
const canSubmit = computed(() => instruction.value.trim().length > 0 && !isLoading.value);
const panelStyle = computed(() => ({
  width: `${panelWidth.value}px`,
}));

const visibleHistoryList = computed(() =>
  historyList.value.filter(
    (item) =>
      (item.conversationId ?? "legacy") === activeConversationId.value &&
      !shouldHideHistoryItem(item),
  ),
);

const pastConversationSummaries = computed(() =>
  conversationSummaries.value.filter((conversation) => conversation.id !== activeConversationId.value),
);

function shouldHideHistoryItem(_item: AIHistoryItem) {
  return false;
}

function finalizeSuccessfulEdit(target: AIHistoryItem) {
  if (isBlankToAiEdit(target)) {
    applyItemChanges(target);
    return;
  }
  target.status = "done";
  expandedDiffId.value = target.id;
}

function scrollToBottom() {
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
}

function upsertAgentActivity(item: AIHistoryItem, activity: AgentActivity) {
  if (!item.agentActivities) {
    item.agentActivities = [];
  }
  const index = item.agentActivities.findIndex((entry) => entry.id === activity.id);
  if (index >= 0) {
    item.agentActivities[index] = activity;
  } else {
    item.agentActivities.push(activity);
  }
}

async function submit() {
  const text = instruction.value.trim();
  if (!text || isLoading.value) return;

  const id = Math.random().toString(36).slice(2, 9);
  const newItem: AIHistoryItem = {
    id,
    timestamp: Date.now(),
    instruction: text,
    status: "loading",
    mode: aiMode.value,
    conversationId: activeConversationId.value,
    originalDoc: props.doc,
    changes: [],
    rawResponse: "",
    agentActivities: aiMode.value === "agent" ? [] : undefined,
  };

  historyList.value.push(newItem);
  instruction.value = "";
  activeAbortController = new AbortController();

  await nextTick();
  scrollToBottom();

  try {
    if (aiMode.value === "agent") {
      const readWorkspaceFile =
        props.readWorkspaceFile ??
        (async () => {
          throw new Error(t("ai.desktopOnlyRead"));
        });

      const result = await runAgent(text, props.doc, {
        documentPath: props.documentPath ?? props.documentKey ?? null,
        workspacePaths: props.workspacePaths ?? [],
        readWorkspaceFile,
        history: buildAgentHistoryFromItems(historyList.value, id, activeConversationId.value),
        signal: activeAbortController.signal,
        onTextDelta: (assistantText) => {
          const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
          if (!target) return;
          target.rawResponse = assistantText;
          target.assistantText = assistantText;
          nextTick(scrollToBottom);
        },
        onActivity: (activity) => {
          const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
          if (!target) return;
          upsertAgentActivity(target, activity);
          nextTick(scrollToBottom);
        },
      });

      const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
      if (target) {
        target.assistantText = result.assistantText;
        target.rawResponse = result.assistantText || target.rawResponse;
        target.agentActivities = result.activities;

        if (result.changes.length > 0) {
          target.changes = result.changes;
          target.resultDoc = applyChangesToDoc(target.originalDoc, result.changes);
          finalizeSuccessfulEdit(target);
        } else if (result.assistantText) {
          target.status = "no-changes";
          target.noChangesHint = undefined;
        } else {
          target.noChangesHint = t("ai.noChangesHint");
          target.status = "no-changes";
        }
      }
    } else {
      const changes = await streamEdit(
        newItem.instruction,
        newItem.originalDoc,
        (delta) => {
          const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
          if (target) {
            target.rawResponse += delta;
            nextTick(scrollToBottom);
          }
        },
        activeAbortController.signal,
      );

      const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
      if (target) {
        if (changes.length === 0) {
          target.noChangesHint = explainNoChanges(target.originalDoc, target.rawResponse);
          target.status = "no-changes";
        } else {
          target.changes = changes;
          target.resultDoc = applyChangesToDoc(target.originalDoc, changes);
          finalizeSuccessfulEdit(target);
        }
      }
    }
  } catch (e: unknown) {
    const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
    if (target) {
      if ((e as Error).name === "AbortError") {
        target.status = "discarded";
      } else {
        target.errorMsg = (e as Error).message;
        target.status = "error";
      }
    }
  } finally {
    activeAbortController = null;
    await nextTick();
    scrollToBottom();
  }
}

function applyItemChanges(item: AIHistoryItem) {
  const labelBase = item.instruction.trim().slice(0, 24) || t("ai.editLabel");
  const nextDoc = applyChangesToDoc(props.doc, item.changes);
  emit("apply", item.changes);
  item.status = "applied";
  item.resultDoc = nextDoc;
  documentVersions.addSnapshot(labelBase, nextDoc, props.doc);
}

function discardItem(item: AIHistoryItem) {
  item.status = "discarded";
  if (expandedDiffId.value === item.id) expandedDiffId.value = null;
}

function handleStartNewConversation() {
  if (isLoading.value) return;
  startNewConversation();
  expandedDiffId.value = null;
}

function clearHistory() {
  if (isLoading.value) return;
  clearAllConversations();
  documentVersions.clearSnapshots();
  expandedDiffId.value = null;
}

function selectConversation(conversationId: string) {
  if (isLoading.value || conversationId === activeConversationId.value) return;
  switchConversation(conversationId);
  expandedDiffId.value = null;
  nextTick(scrollToBottom);
}

function stop() {
  activeAbortController?.abort();
}

function toggleDiff(item: AIHistoryItem) {
  expandedDiffId.value = expandedDiffId.value === item.id ? null : item.id;
}

function onCompositionStart() {
  imeComposing = true;
}

function onCompositionEnd() {
  imeComposing = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Enter") return;
  if (e.isComposing || imeComposing || e.keyCode === 229) return;
  if (e.shiftKey) return;

  e.preventDefault();
  void submit();
}

function formatShortTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function conversationTurnLabel(count: number) {
  return count === 0 ? t("ai.noRounds") : t("ai.roundCount", { count });
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getFullDocDiff(item: AIHistoryItem) {
  const newDoc = applyChangesToDoc(item.originalDoc, item.changes);
  const diffs = lineDiff(item.originalDoc, newDoc);
  return compressDiff(diffs, 2);
}

function getChangeDiff(change: EditChange, originalDoc: string) {
  const oldStr = originalDoc.slice(change.from, change.to);
  const newStr = change.insert;
  return lineDiff(oldStr, newStr);
}

function statusLabel(item: AIHistoryItem) {
  if (item.status === "applied") return t("ai.statusApplied");
  if (item.status === "done") return t("ai.statusDone");
  if (item.status === "no-changes") return t("ai.statusNoChanges");
  if (item.status === "error") return t("ai.statusError");
  if (item.status === "discarded") return t("ai.statusDiscarded");
  if (item.status === "loading") return t("ai.statusLoading");
  return "";
}

function diffSummaryLabel(item: AIHistoryItem) {
  const { added, removed, changeCount } = summarizeItemDiff(item);
  if (changeCount === 0) return t("ai.viewDetails");
  const parts: string[] = [];
  if (changeCount > 1) parts.push(t("ai.changeCount", { count: changeCount }));
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join(" · ") || t("ai.viewDiffHint");
}

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

function persistPanelWidth() {
  localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth.value));
}

function loadPanelWidth() {
  const savedWidth = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
  if (Number.isFinite(savedWidth)) {
    panelWidth.value = clampPanelWidth(savedWidth);
  }
}

function setPanelWidth(width: number, shouldPersist = true) {
  panelWidth.value = clampPanelWidth(width);
  if (shouldPersist) {
    persistPanelWidth();
  }
}

function onResizeMove(event: PointerEvent) {
  const deltaX = event.clientX - resizeStartX;
  setPanelWidth(resizeStartWidth - deltaX, false);
}

function stopResize() {
  if (!isResizing.value) return;
  isResizing.value = false;
  document.removeEventListener("pointermove", onResizeMove);
  document.removeEventListener("pointerup", stopResize);
  document.removeEventListener("pointercancel", stopResize);
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  persistPanelWidth();
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  isResizing.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("pointermove", onResizeMove);
  document.addEventListener("pointerup", stopResize);
  document.addEventListener("pointercancel", stopResize);
}

function onResizeKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 40 : 16;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setPanelWidth(panelWidth.value + step);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    setPanelWidth(panelWidth.value - step);
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    setPanelWidth(MIN_PANEL_WIDTH);
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    setPanelWidth(MAX_PANEL_WIDTH);
  }
}

onMounted(() => {
  loadPanelWidth();
  scrollToBottom();
});

onUnmounted(() => {
  stopResize();
});
</script>

<template>
  <aside class="ai-panel" :class="{ 'is-resizing': isResizing }" :style="panelStyle">
    <div
      class="ai-resize-handle"
      role="separator"
      :aria-label="t('ai.resize')"
      aria-orientation="vertical"
      :aria-valuemin="MIN_PANEL_WIDTH"
      :aria-valuemax="MAX_PANEL_WIDTH"
      :aria-valuenow="panelWidth"
      tabindex="0"
      :title="t('ai.resizeTitle')"
      @pointerdown="startResize"
      @keydown="onResizeKeydown"
    />
    <header class="ai-header">
      <div class="ai-brand">
        <span class="ai-brand-icon"><Bot :size="15" aria-hidden="true" /></span>
        <span class="ai-title">{{ t("ai.title") }}</span>
      </div>
      <div class="ai-mode-toggle">
        <button
          type="button"
          class="ai-mode-btn"
          :class="{ active: aiMode === 'agent' }"
          :disabled="isLoading"
          @click="aiMode = 'agent'"
        >
          <Bot :size="12" aria-hidden="true" />
          Agent
        </button>
        <button
          type="button"
          class="ai-mode-btn"
          :class="{ active: aiMode === 'quick' }"
          :disabled="isLoading"
          @click="aiMode = 'quick'"
        >
          <GitCompare :size="12" aria-hidden="true" />
          {{ t("ai.quick") }}
        </button>
      </div>
      <div class="ai-header-actions">
        <button
          type="button"
          class="ai-header-btn"
          :title="t('ai.newConversation')"
          :disabled="isLoading"
          @click="handleStartNewConversation"
        >
          <Plus :size="iconSize" aria-hidden="true" />
        </button>
        <button
          v-if="historyList.length > 0"
          type="button"
          class="ai-header-btn"
          :title="t('ai.clearHistory')"
          :disabled="isLoading"
          @click="clearHistory"
        >
          <Trash2 :size="iconSize" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div ref="listRef" class="ai-history-list">
      <section v-if="pastConversationSummaries.length > 0" class="conversation-history">
        <div class="conversation-history-title">
          <Clock3 :size="12" aria-hidden="true" />
          {{ t("ai.history") }}
        </div>
        <button
          v-for="conversation in pastConversationSummaries"
          :key="conversation.id"
          type="button"
          class="conversation-history-item"
          :disabled="isLoading"
          @click="selectConversation(conversation.id)"
        >
          <span class="conversation-history-item-title">{{ conversation.title }}</span>
          <span class="conversation-history-item-meta">
            {{ conversationTurnLabel(conversation.turnCount) }} · {{ formatShortTime(conversation.updatedAt) }}
          </span>
        </button>
      </section>

      <div v-if="visibleHistoryList.length === 0" class="ai-empty">
        <div class="ai-empty-title">{{ t("ai.emptyTitle") }}</div>
        <div class="ai-empty-desc">{{ t("ai.emptyDesc") }}</div>
      </div>

      <div
        v-for="item in visibleHistoryList"
        :key="item.id"
        class="history-card"
        :class="[`status-${item.status}`, { 'is-diff-expanded': expandedDiffId === item.id }]"
      >
        <div class="card-header">
          <div class="card-instruction" :title="item.instruction">
            <span class="user-tag">{{ t("ai.instruction") }}</span>
            {{ item.instruction }}
          </div>
          <div class="card-meta">
            <span class="card-status" :class="`status-tag-${item.status}`">{{ statusLabel(item) }}</span>
            <span class="card-time">{{ formatTime(item.timestamp) }}</span>
          </div>
        </div>

        <div class="card-body">
          <div v-if="item.status === 'loading'" class="ai-loading-box">
            <span class="ai-loading-text">
              {{ item.mode === 'agent' ? t('ai.agentRunning') : t('ai.generating') }}
            </span>
            <AgentActivityList
              v-if="item.agentActivities?.length"
              :activities="item.agentActivities"
            />
            <pre v-else-if="item.mode === 'agent' && item.rawResponse" class="agent-stream-preview">{{ item.rawResponse }}</pre>
            <button class="ai-btn ai-btn-stop" type="button" @click="stop">
              <Square :size="12" aria-hidden="true" />
              {{ t("ai.stop") }}
            </button>
          </div>

          <div v-else-if="item.status === 'error'" class="ai-error-box">
            <span class="error-label">{{ t("ai.error") }}</span>
            <div class="error-msg">{{ item.errorMsg }}</div>
          </div>

          <div v-else-if="item.status === 'no-changes'" class="ai-muted-box">
            <span class="muted-label">
              {{ item.assistantText && item.mode === 'agent' ? t('ai.reply') : t('ai.noChangesNeeded') }}
            </span>
            <div class="muted-msg agent-reply-text">
              {{ item.assistantText || item.noChangesHint || t("ai.noChangesDefault") }}
            </div>
            <AgentActivityList
              v-if="item.agentActivities?.length"
              :activities="item.agentActivities"
              done
            />
          </div>

          <div v-else-if="item.status === 'discarded'" class="ai-muted-box">
            <span class="muted-label">{{ t("ai.discarded") }}</span>
          </div>

          <div v-else-if="item.status === 'done' || item.status === 'applied'" class="ai-diff-box">
            <AgentActivityList
              v-if="item.mode === 'agent' && item.agentActivities?.length"
              :activities="item.agentActivities"
              done
            />

            <button
              class="diff-toggle"
              type="button"
              :aria-expanded="expandedDiffId === item.id"
              @click="toggleDiff(item)"
            >
              <span class="diff-toggle-label">
                {{ expandedDiffId === item.id ? t("ai.collapseDiff") : t("ai.viewDiff") }}
              </span>
              <span class="diff-toggle-summary">{{ diffSummaryLabel(item) }}</span>
              <span class="diff-toggle-chevron" :class="{ expanded: expandedDiffId === item.id }">›</span>
            </button>

            <div v-if="expandedDiffId === item.id" class="diff-container">
              <div v-if="isFullDocChange(item.changes, item.originalDoc)" class="diff-block">
                <div class="diff-title">{{ t("ai.fullDocDiff") }}</div>
                <div class="diff-lines">
                  <div
                    v-for="(line, idx) in getFullDocDiff(item)"
                    :key="idx"
                    :class="['diff-line', `diff-type-${line.type}`]"
                  >
                    <span class="diff-sign">
                      {{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}
                    </span>
                    <span class="diff-content">{{ line.text }}</span>
                  </div>
                </div>
              </div>

              <div v-else class="diff-block">
                <div class="diff-title">{{ t("ai.changePoints", { count: item.changes.length }) }}</div>
                <div
                  v-for="(change, idx) in item.changes"
                  :key="idx"
                  class="diff-sub-block"
                >
                  <div class="diff-sub-title">{{ t("ai.changePoint", { index: idx + 1 }) }}</div>
                  <div class="diff-lines">
                    <div
                      v-for="(line, lIdx) in getChangeDiff(change, item.originalDoc)"
                      :key="lIdx"
                      :class="['diff-line', `diff-type-${line.type}`]"
                    >
                      <span class="diff-sign">
                        {{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}
                      </span>
                      <span class="diff-content">{{ line.text }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card-actions card-actions-split">
              <div v-if="item.status === 'done'" class="card-actions-main">
                <button class="ai-btn ai-btn-apply" @click="applyItemChanges(item)">{{ t("ai.apply") }}</button>
                <button class="ai-btn ai-btn-ghost" @click="discardItem(item)">{{ t("ai.discard") }}</button>
              </div>
              <span v-else class="applied-badge">{{ t("ai.applied") }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="ai-input-area">
      <textarea
        v-model="instruction"
        class="ai-input"
        :placeholder="aiMode === 'agent' ? t('ai.agentPlaceholder') : t('ai.editPlaceholder')"
        :disabled="isLoading"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @keydown="onKeydown"
      />
      <div class="ai-actions">
        <span class="ai-input-meta">{{ t("ai.charCount", { count: instruction.trim().length }) }}</span>
        <button
          class="ai-btn ai-btn-primary"
          :class="{ 'is-loading': isLoading }"
          :disabled="!canSubmit"
          :aria-busy="isLoading"
          @click="submit"
        >
          <span v-if="isLoading" class="ai-send-spinner" aria-hidden="true" />
          <Send v-else :size="13" aria-hidden="true" />
          {{ isLoading ? t("ai.sending") : t("ai.send") }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-panel {
  --ai-radius: 8px;
  --ai-radius-sm: 6px;
  --ai-surface-subtle: color-mix(in srgb, var(--ink-bg) 72%, var(--ink-surface));
  --ai-surface-raised: color-mix(in srgb, var(--ink-surface) 90%, var(--ink-bg));
  --ai-shadow-soft: 0 8px 22px color-mix(in srgb, var(--ink-shadow) 38%, transparent);

  display: flex;
  flex-direction: column;
  position: relative;
  width: 320px;
  min-width: 280px;
  max-width: 560px;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ink-surface) 92%, var(--ink-bg)) 0%, var(--ink-surface) 34%),
    var(--ink-surface);
  border-left: 1px solid var(--ink-border);
}

.ai-resize-handle {
  position: absolute;
  inset: 0 auto 0 -5px;
  z-index: 5;
  width: 10px;
  cursor: col-resize;
  outline: none;
  touch-action: none;
}

.ai-resize-handle::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 4px;
  width: 2px;
  height: 42px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink-text-muted) 24%, transparent);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.15s ease, background 0.15s ease, height 0.15s ease;
}

.ai-resize-handle:hover::before,
.ai-resize-handle:focus-visible::before,
.ai-panel.is-resizing .ai-resize-handle::before {
  height: 64px;
  opacity: 1;
  background: var(--ink-accent);
}

.ai-panel.is-resizing {
  border-left-color: color-mix(in srgb, var(--ink-accent) 46%, var(--ink-border));
}

.ai-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.ai-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ai-brand-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
  border: 1px solid color-mix(in srgb, var(--ink-accent) 24%, var(--ink-border));
  border-radius: var(--ai-radius-sm);
}

.ai-title {
  overflow: hidden;
  color: var(--ink-text);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-mode-toggle {
  display: flex;
  grid-column: 1 / -1;
  grid-row: 2;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius);
  background: var(--ai-surface-subtle);
}

.ai-header-actions {
  display: flex;
  grid-column: 2;
  grid-row: 1;
  align-items: center;
  gap: 4px;
  justify-self: end;
}

.ai-mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 5px 8px;
  color: var(--ink-text-muted);
  font-size: 11px;
  font-weight: 650;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.ai-mode-btn.active {
  color: var(--ink-text);
  background: var(--ink-surface);
  border-color: var(--ink-border);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ink-shadow) 58%, transparent);
}

.ai-mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 28px;
  min-height: 28px;
  padding: 5px 8px;
  color: var(--ink-text-muted);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: var(--ai-radius-sm);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.ai-header-btn:hover:not(:disabled) {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
  border-color: color-mix(in srgb, var(--ink-accent) 16%, var(--ink-border));
}

.ai-header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-history-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.ai-history-list::-webkit-scrollbar,
.diff-lines::-webkit-scrollbar,
.agent-stream-preview::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.ai-history-list::-webkit-scrollbar-thumb,
.diff-lines::-webkit-scrollbar-thumb,
.agent-stream-preview::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ink-text-muted) 26%, transparent);
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.ai-empty {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 190px;
  margin: auto 0;
  padding: 44px 18px;
  color: var(--ink-text-muted);
  text-align: center;
}

.ai-empty::before {
  content: "";
  width: 42px;
  height: 42px;
  margin-bottom: 14px;
  border: 1px solid color-mix(in srgb, var(--ink-accent) 24%, var(--ink-border));
  border-radius: 50%;
  background:
    radial-gradient(circle at center, var(--ink-accent) 0 3px, transparent 4px),
    linear-gradient(var(--ink-accent-soft), var(--ink-accent-soft));
  box-shadow: inset 0 0 0 10px color-mix(in srgb, var(--ink-surface) 80%, transparent);
  opacity: 0.9;
}

.ai-empty-title {
  margin-bottom: 6px;
  color: var(--ink-text);
  font-size: 13px;
  font-weight: 650;
}

.ai-empty-desc {
  max-width: 230px;
  font-size: 11px;
  line-height: 1.65;
  opacity: 0.82;
}

.conversation-history {
  padding: 10px;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius);
  background: var(--ai-surface-subtle);
}

.conversation-history-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  color: var(--ink-text-muted);
  font-size: 11px;
  font-weight: 650;
}

.conversation-history-item {
  width: 100%;
  cursor: pointer;
  text-align: left;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius);
  background: var(--ink-surface);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.conversation-history-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  margin-bottom: 6px;
  padding: 9px 10px;
}

.conversation-history-item:last-child {
  margin-bottom: 0;
}

.conversation-history-item:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ink-accent) 34%, var(--ink-border));
  background: color-mix(in srgb, var(--ink-accent-soft) 52%, var(--ink-surface));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ink-shadow) 32%, transparent);
  transform: translateY(-1px);
}

.conversation-history-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.conversation-history-item-title {
  overflow: hidden;
  width: 100%;
  color: var(--ink-text);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-history-item-meta,
.card-time {
  color: var(--ink-text-muted);
  font-size: 10px;
}

.history-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius);
  background: var(--ai-surface-raised);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--ink-inset) 76%, transparent);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.history-card::before {
  content: "";
  position: absolute;
  inset: 10px auto 10px 0;
  width: 2px;
  border-radius: 999px;
  background: transparent;
}

.history-card.is-diff-expanded {
  border-color: var(--ink-border-strong);
  box-shadow: var(--ai-shadow-soft);
}

.status-loading {
  border-color: color-mix(in srgb, var(--ink-accent) 34%, var(--ink-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink-accent-soft) 72%, transparent);
}

.status-loading::before {
  background: var(--ink-accent);
}

.status-error {
  border-color: color-mix(in srgb, #e53e3e 34%, var(--ink-border));
}

.status-error::before {
  background: #e53e3e;
}

.status-applied {
  border-color: color-mix(in srgb, #38a169 26%, var(--ink-border));
}

.status-discarded {
  opacity: 0.68;
}

.card-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.card-instruction {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  min-width: 0;
  color: var(--ink-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.user-tag {
  flex-shrink: 0;
  margin-top: 1px;
  padding: 2px 5px;
  color: var(--ink-accent);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid color-mix(in srgb, var(--ink-accent) 18%, var(--ink-border));
  border-radius: 4px;
  background: var(--ink-accent-soft);
}

.card-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  flex-shrink: 0;
}

.card-status {
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 750;
  line-height: 1.35;
  border-radius: 999px;
}

.status-tag-done {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.status-tag-applied,
.applied-badge {
  color: #2f855a;
  background: color-mix(in srgb, #38a169 13%, transparent);
}

.status-tag-loading,
.status-tag-no-changes,
.status-tag-discarded {
  color: var(--ink-text-muted);
  background: var(--ink-inset);
}

.status-tag-error {
  color: #e53e3e;
  background: color-mix(in srgb, #e53e3e 11%, transparent);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-loading-box,
.ai-error-box,
.ai-muted-box {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
  border-radius: var(--ai-radius-sm);
  border: 1px solid var(--ink-border);
  background: var(--ink-inset);
}

.ai-loading-box {
  position: relative;
}

.ai-loading-box::before {
  content: "";
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, transparent, var(--ink-accent), transparent)
    0 0 / 72px 100% no-repeat,
    color-mix(in srgb, var(--ink-accent) 12%, transparent);
  animation: ai-progress 1.45s ease-in-out infinite;
}

.ai-loading-text,
.muted-label,
.error-label {
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.04em;
}

.ai-loading-text,
.muted-label {
  color: var(--ink-text-muted);
}

.ai-error-box {
  background: color-mix(in srgb, #e53e3e 7%, transparent);
  border-color: color-mix(in srgb, #e53e3e 19%, transparent);
}

.error-label {
  color: #e53e3e;
}

.error-msg,
.muted-msg {
  color: var(--ink-text);
  font-size: 11px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.muted-msg {
  color: var(--ink-text-muted);
}

.agent-reply-text {
  white-space: pre-wrap;
}

.agent-stream-preview {
  max-height: 138px;
  margin: 2px 0 0;
  padding: 9px 10px;
  overflow: auto;
  color: var(--ink-text);
  font-family: var(--font-editor);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius-sm);
  background: var(--ai-surface-subtle);
}

.ai-diff-box {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.diff-toggle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 8px 9px;
  text-align: left;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius-sm);
  background: var(--ink-inset);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.diff-toggle:hover {
  background: var(--ink-inset-hover);
  border-color: var(--ink-border-strong);
}

.diff-toggle-label {
  color: var(--ink-text);
  font-size: 11px;
  font-weight: 700;
}

.diff-toggle-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-toggle-chevron {
  color: var(--ink-text-muted);
  font-size: 16px;
  line-height: 1;
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.diff-toggle-chevron.expanded {
  transform: rotate(-90deg);
}

.diff-container {
  overflow: hidden;
  border: 1px solid var(--ink-border);
  border-radius: var(--ai-radius-sm);
  background: var(--ai-surface-subtle);
}

.diff-title,
.diff-sub-title {
  color: var(--ink-text-muted);
  font-weight: 750;
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--ink-border);
}

.diff-title {
  padding: 7px 10px;
  font-size: 10px;
  background: color-mix(in srgb, var(--ink-inset) 72%, transparent);
}

.diff-sub-block {
  border-bottom: 1px solid var(--ink-border);
}

.diff-sub-block:last-child {
  border-bottom: none;
}

.diff-sub-title {
  padding: 5px 10px;
  font-size: 9px;
}

.diff-lines {
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow-y: auto;
}

.diff-line {
  display: flex;
  padding: 2px 9px;
  font-family: var(--font-editor);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.diff-sign {
  flex-shrink: 0;
  width: 15px;
  opacity: 0.75;
  user-select: none;
}

.diff-content {
  flex: 1;
}

.diff-type-removed {
  color: #c53030;
  background: color-mix(in srgb, #e53e3e 9%, transparent);
}

.diff-type-added {
  color: #2f855a;
  background: color-mix(in srgb, #38a169 10%, transparent);
}

.diff-type-normal {
  color: var(--ink-text-muted);
}

.diff-type-ellipsis {
  justify-content: center;
  padding: 5px 9px;
  color: var(--ink-text-muted);
  font-size: 10px;
  font-style: italic;
  background: color-mix(in srgb, var(--ink-bg) 82%, var(--ink-surface));
  opacity: 0.62;
}

.card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.card-actions-split {
  justify-content: space-between;
  flex-wrap: wrap;
}

.card-actions-main {
  display: flex;
  gap: 7px;
}

.applied-badge {
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
}

.ai-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 28px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: var(--ai-radius-sm);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.ai-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ai-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.ai-btn-primary,
.ai-btn-apply {
  color: #fff;
  background: var(--ink-accent);
  border-color: color-mix(in srgb, var(--ink-accent) 80%, #000);
}

.ai-btn-primary {
  min-width: 76px;
  padding-inline: 12px;
}

.ai-btn-primary:hover:not(:disabled),
.ai-btn-apply:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ink-accent) 88%, #000);
}

.ai-btn-primary.is-loading:disabled {
  opacity: 1;
  cursor: wait;
}

.ai-send-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ai-send-spin 0.8s linear infinite;
}

.ai-btn-stop {
  align-self: flex-start;
  color: #c53030;
  background: color-mix(in srgb, #e53e3e 9%, transparent);
  border-color: color-mix(in srgb, #e53e3e 18%, transparent);
}

.ai-btn-stop:hover:not(:disabled) {
  background: color-mix(in srgb, #e53e3e 14%, transparent);
}

.ai-btn-ghost {
  color: var(--ink-text-muted);
  background: transparent;
  border-color: var(--ink-border);
}

.ai-btn-ghost:hover:not(:disabled) {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
  border-color: color-mix(in srgb, var(--ink-accent) 20%, var(--ink-border));
}

.ai-input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--ink-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ink-surface) 76%, transparent), var(--ink-surface)),
    var(--ink-surface);
  box-shadow: 0 -10px 20px color-mix(in srgb, var(--ink-shadow) 18%, transparent);
}

.ai-input {
  width: 100%;
  min-height: 84px;
  max-height: 150px;
  padding: 10px 11px;
  resize: vertical;
  color: var(--ink-text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.55;
  border: 1px solid var(--ink-border-strong);
  border-radius: var(--ai-radius);
  outline: none;
  background: color-mix(in srgb, var(--ink-bg) 84%, var(--ink-surface));
  box-shadow: inset 0 1px 0 var(--ink-inset);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.ai-input::placeholder {
  color: color-mix(in srgb, var(--ink-text-muted) 76%, transparent);
}

.ai-input:focus {
  border-color: color-mix(in srgb, var(--ink-accent) 70%, var(--ink-border));
  background: var(--ink-surface);
  box-shadow:
    inset 0 1px 0 var(--ink-inset),
    0 0 0 3px color-mix(in srgb, var(--ink-accent-soft) 80%, transparent);
}

.ai-input:disabled {
  opacity: 0.62;
}

.ai-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-input-meta {
  color: var(--ink-text-muted);
  font-size: 10px;
}

@keyframes ai-send-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ai-progress {
  0% {
    background-position: -80px 0, 0 0;
  }

  100% {
    background-position: calc(100% + 80px) 0, 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-loading-box::before,
  .ai-send-spinner {
    animation: none;
  }

  .ai-btn,
  .conversation-history-item {
    transition: none;
  }
}
</style>
