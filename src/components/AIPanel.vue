<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from "vue";
import {
  explainNoChanges,
  useAI,
  applyChangesToDoc,
  isFullDocChange,
  lineDiff,
  compressDiff,
  summarizeItemDiff,
  isBlankDocument,
  isBlankToAiEdit,
  type EditChange,
  type AIHistoryItem
} from "../composables/useAI";
import { useDocumentVersions, type DocumentVersion } from "../composables/useDocumentVersions";
import AIVersionViewer from "./AIVersionViewer.vue";

const props = defineProps<{
  doc: string;
  documentKey?: string | null;
}>();

const emit = defineEmits<{
  apply: [changes: EditChange[]];
  restore: [content: string];
}>();

const resolvedDocumentKey = computed(() => props.documentKey?.trim() || "__untitled__");
const { streamEdit, historyList } = useAI(() => resolvedDocumentKey.value);
const documentVersions = useDocumentVersions(() => resolvedDocumentKey.value);

const instruction = ref("");
const listRef = ref<HTMLElement | null>(null);
const expandedDiffId = ref<string | null>(null);
const panelMode = ref<"edits" | "versions">("edits");
const viewingVersionId = ref<string | null>(null);
let activeAbortController: AbortController | null = null;
let imeComposing = false;

const isLoading = computed(() => historyList.value.some((item: AIHistoryItem) => item.status === "loading"));

const visibleHistoryList = computed(() =>
  historyList.value.filter((item) => !shouldHideHistoryItem(item))
);

const documentVersionList = computed(() => documentVersions.listVersions(historyList.value));

function shouldHideHistoryItem(item: AIHistoryItem) {
  if (isBlankToAiEdit(item)) return true;
  return isBlankDocument(item.originalDoc) && item.status === "loading";
}

function scrollToBottom() {
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
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
    originalDoc: props.doc,
    changes: [],
    rawResponse: ""
  };

  historyList.value.push(newItem);
  instruction.value = "";
  activeAbortController = new AbortController();

  await nextTick();
  scrollToBottom();

  try {
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
      activeAbortController.signal
    );

    const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
    if (target) {
      if (changes.length === 0) {
        target.noChangesHint = explainNoChanges(target.originalDoc, target.rawResponse);
        target.status = "no-changes";
      } else {
        target.changes = changes;
        target.resultDoc = applyChangesToDoc(target.originalDoc, changes);
        target.status = "done";
        if (isBlankToAiEdit(target)) {
          deleteItem(id);
        } else {
          expandedDiffId.value = id;
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
  const labelBase = item.instruction.trim().slice(0, 24) || "AI 修改";
  if (!isBlankDocument(props.doc)) {
    documentVersions.addSnapshot(`应用前 · ${labelBase}`, props.doc);
  }
  const nextDoc = applyChangesToDoc(props.doc, item.changes);
  emit("apply", item.changes);
  item.status = "applied";
  item.resultDoc = nextDoc;
  documentVersions.addSnapshot(`应用后 · ${labelBase}`, nextDoc);
}

function discardItem(item: AIHistoryItem) {
  item.status = "discarded";
  if (expandedDiffId.value === item.id) expandedDiffId.value = null;
}

function deleteItem(id: string) {
  const idx = historyList.value.findIndex((item: AIHistoryItem) => item.id === id);
  if (idx !== -1) {
    historyList.value.splice(idx, 1);
  }
  documentVersions.removeVersionsForHistoryItem(id);
  if (expandedDiffId.value === id) expandedDiffId.value = null;
  if (viewingVersionId.value?.startsWith(`${id}:`)) viewingVersionId.value = null;
}

function clearHistory() {
  historyList.value = [];
  documentVersions.clearSnapshots();
  expandedDiffId.value = null;
  viewingVersionId.value = null;
}

function openVersion(version: DocumentVersion) {
  viewingVersionId.value = version.id;
}

function closeVersionViewer() {
  viewingVersionId.value = null;
}

function restoreVersion(content: string) {
  emit("restore", content);
  viewingVersionId.value = null;
}

function versionKindLabel(kind: DocumentVersion["kind"]) {
  if (kind === "ai-before") return "修改前";
  if (kind === "ai-after") return "修改后";
  return "快照";
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
  if (item.status === "applied") return "已应用";
  if (item.status === "done") return "待应用";
  if (item.status === "no-changes") return "无修改";
  if (item.status === "error") return "出错";
  if (item.status === "discarded") return "已忽略";
  if (item.status === "loading") return "生成中";
  return "";
}

function diffSummaryLabel(item: AIHistoryItem) {
  const { added, removed, changeCount } = summarizeItemDiff(item);
  if (changeCount === 0) return "点击查看详情";
  const parts: string[] = [];
  if (changeCount > 1) parts.push(`${changeCount} 处修改`);
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join(" · ") || "点击查看 diff";
}

onMounted(() => {
  scrollToBottom();
});
</script>

<template>
  <aside class="ai-panel">
    <header class="ai-header">
      <span>AI 编辑</span>
      <button
        v-if="visibleHistoryList.length > 0 || documentVersionList.length > 0"
        class="ai-clear-btn"
        title="清空修改记录与版本快照"
        @click="clearHistory"
      >
        清空
      </button>
    </header>

    <div class="ai-panel-tabs">
      <button
        class="panel-tab-btn"
        :class="{ active: panelMode === 'edits' }"
        type="button"
        @click="panelMode = 'edits'"
      >
        对话 {{ visibleHistoryList.length }}
      </button>
      <button
        class="panel-tab-btn"
        :class="{ active: panelMode === 'versions' }"
        type="button"
        @click="panelMode = 'versions'"
      >
        历史版本 {{ documentVersionList.length }}
      </button>
    </div>

    <div ref="listRef" class="ai-history-list">
      <template v-if="panelMode === 'versions'">
        <div v-if="documentVersionList.length === 0" class="ai-empty">
          <div class="ai-empty-title">暂无历史版本</div>
          <div class="ai-empty-desc">完成 AI 修改或应用变更后，会在此保存可查看、可恢复的文档版本。</div>
        </div>

        <button
          v-for="version in documentVersionList"
          :key="version.id"
          class="version-card"
          type="button"
          @click="openVersion(version)"
        >
          <span class="version-card-kind">{{ versionKindLabel(version.kind) }}</span>
          <span class="version-card-title">{{ version.label }}</span>
          <span class="version-card-meta">
            <span>{{ formatTime(version.timestamp) }}</span>
            <span>{{ version.content.length }} 字</span>
          </span>
        </button>
      </template>

      <template v-else>
      <div v-if="visibleHistoryList.length === 0" class="ai-empty">
        <div class="ai-empty-title">无修改历史</div>
        <div class="ai-empty-desc">每次对话的修改会保存为卡片，点击可查看 diff，并支持按文档持久化。</div>
      </div>

      <div
        v-for="item in visibleHistoryList"
        :key="item.id"
        class="history-card"
        :class="[`status-${item.status}`, { 'is-diff-expanded': expandedDiffId === item.id }]"
      >
        <div class="card-header">
          <div class="card-instruction" :title="item.instruction">
            <span class="user-tag">指令</span>
            {{ item.instruction }}
          </div>
          <div class="card-meta">
            <span class="card-status" :class="`status-tag-${item.status}`">{{ statusLabel(item) }}</span>
            <span class="card-time">{{ formatTime(item.timestamp) }}</span>
            <button class="card-delete-btn" title="删除记录" @click.stop="deleteItem(item.id)">×</button>
          </div>
        </div>

        <div class="card-body">
          <div v-if="item.status === 'loading'" class="ai-stream">
            <div class="ai-stream-text">{{ item.rawResponse }}<span class="ai-cursor" /></div>
            <button class="ai-btn ai-btn-stop" @click="stop">停止</button>
          </div>

          <div v-else-if="item.status === 'error'" class="ai-error-box">
            <span class="error-label">出错</span>
            <div class="error-msg">{{ item.errorMsg }}</div>
          </div>

          <div v-else-if="item.status === 'no-changes'" class="ai-muted-box">
            <span class="muted-label">评估无需修改</span>
            <div class="muted-msg">{{ item.noChangesHint || "原文已符合要求，未做任何改动。" }}</div>
          </div>

          <div v-else-if="item.status === 'discarded'" class="ai-muted-box">
            <span class="muted-label">已忽略</span>
          </div>

          <div v-else-if="item.status === 'done' || item.status === 'applied'" class="ai-diff-box">
            <button
              class="diff-toggle"
              type="button"
              :aria-expanded="expandedDiffId === item.id"
              @click="toggleDiff(item)"
            >
              <span class="diff-toggle-label">
                {{ expandedDiffId === item.id ? "收起 diff" : "查看 diff" }}
              </span>
              <span class="diff-toggle-summary">{{ diffSummaryLabel(item) }}</span>
              <span class="diff-toggle-chevron" :class="{ expanded: expandedDiffId === item.id }">›</span>
            </button>

            <div v-if="expandedDiffId === item.id" class="diff-container">
              <div v-if="isFullDocChange(item.changes, item.originalDoc)" class="diff-block">
                <div class="diff-title">全文修改（已折叠相同行）</div>
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
                <div class="diff-title">找到 {{ item.changes.length }} 处修改</div>
                <div
                  v-for="(change, idx) in item.changes"
                  :key="idx"
                  class="diff-sub-block"
                >
                  <div class="diff-sub-title">修改点 {{ idx + 1 }}</div>
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
              <button
                v-if="item.resultDoc || item.changes.length > 0"
                class="ai-btn ai-btn-ghost"
                type="button"
                @click="openVersion({
                  id: `${item.id}:after`,
                  timestamp: item.timestamp,
                  label: `修改后 · ${item.instruction}`,
                  content: item.resultDoc ?? applyChangesToDoc(item.originalDoc, item.changes),
                  kind: 'ai-after',
                  historyItemId: item.id
                })"
              >
                查看版本
              </button>
              <div v-if="item.status === 'done'" class="card-actions-main">
                <button class="ai-btn ai-btn-apply" @click="applyItemChanges(item)">应用</button>
                <button class="ai-btn ai-btn-ghost" @click="discardItem(item)">忽略</button>
              </div>
              <span v-else class="applied-badge">已应用</span>
            </div>
          </div>
        </div>
      </div>
      </template>
    </div>

    <AIVersionViewer
      v-if="viewingVersionId"
      :versions="documentVersionList"
      :active-id="viewingVersionId"
      :current-doc="doc"
      @update:active-id="viewingVersionId = $event"
      @close="closeVersionViewer"
      @restore="restoreVersion"
    />

    <div class="ai-input-area">
      <textarea
        v-model="instruction"
        class="ai-input"
        placeholder="描述你想做的修改…&#10;↵ 发送，⇧↵ 换行"
        :disabled="isLoading"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @keydown="onKeydown"
      />
      <div class="ai-actions">
        <button
          class="ai-btn ai-btn-primary"
          :disabled="!instruction.trim() || isLoading"
          @click="submit"
        >
          发送
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  width: 290px;
  flex-shrink: 0;
  background: var(--ink-surface);
  border-left: 1px solid var(--ink-border);
  overflow: hidden;
  height: 100%;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-text-muted);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.ai-clear-btn {
  font-size: 11px;
  color: var(--ink-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.ai-clear-btn:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.ai-panel-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 12px 0;
  flex-shrink: 0;
}

.panel-tab-btn {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: var(--ink-bg);
  color: var(--ink-text-muted);
  cursor: pointer;
}

.panel-tab-btn.active {
  border-color: var(--ink-accent);
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.version-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.version-card:hover {
  border-color: var(--ink-border-strong);
  background: var(--ink-accent-soft);
}

.version-card-kind {
  font-size: 9px;
  font-weight: 600;
  color: var(--ink-accent);
  letter-spacing: 0.04em;
}

.version-card-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text);
  line-height: 1.4;
  word-break: break-all;
}

.version-card-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--ink-text-muted);
}

.card-actions-split {
  flex-wrap: wrap;
  justify-content: space-between;
}

.card-actions-main {
  display: flex;
  gap: 6px;
}

.ai-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
  margin: auto 0;
  color: var(--ink-text-muted);
  flex: 1;
}

.ai-empty-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--ink-text);
}

.ai-empty-desc {
  font-size: 11px;
  line-height: 1.6;
  opacity: 0.8;
}

.history-card {
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  background: var(--ink-bg);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.history-card.is-diff-expanded {
  border-color: var(--ink-border-strong);
}

.status-loading {
  border-color: var(--ink-border-strong);
  box-shadow: 0 0 8px color-mix(in srgb, var(--ink-accent) 8%, transparent);
}

.status-error {
  border-color: color-mix(in srgb, #e53e3e 25%, var(--ink-border));
}

.status-applied {
  border-color: color-mix(in srgb, #38a169 20%, var(--ink-border));
}

.status-discarded {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.card-instruction {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text);
  line-height: 1.4;
  word-break: break-all;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.user-tag {
  background: var(--ink-border-strong);
  color: var(--ink-text-muted);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.card-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.card-status {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
}

.status-tag-done {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.status-tag-applied {
  color: #2f855a;
  background: color-mix(in srgb, #38a169 12%, transparent);
}

.status-tag-loading,
.status-tag-no-changes,
.status-tag-discarded {
  color: var(--ink-text-muted);
  background: var(--ink-surface);
}

.status-tag-error {
  color: #e53e3e;
  background: color-mix(in srgb, #e53e3e 10%, transparent);
}

.card-time {
  font-size: 10px;
  color: var(--ink-text-muted);
}

.card-delete-btn {
  background: none;
  border: none;
  color: var(--ink-text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.5;
  transition: opacity 0.1s;
}

.card-delete-btn:hover {
  opacity: 1;
  color: #e53e3e;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-stream {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-stream-text {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  line-height: 1.5;
  color: var(--ink-text-muted);
  background: var(--ink-surface);
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--ink-border);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 150px;
  overflow-y: auto;
}

.ai-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--ink-accent);
  vertical-align: text-bottom;
  margin-left: 1px;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.ai-error-box {
  background: color-mix(in srgb, #e53e3e 6%, transparent);
  border: 1px solid color-mix(in srgb, #e53e3e 15%, transparent);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.error-label {
  font-size: 10px;
  font-weight: 600;
  color: #e53e3e;
}

.error-msg {
  font-size: 11px;
  color: var(--ink-text);
  line-height: 1.4;
  word-break: break-all;
}

.ai-muted-box {
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.muted-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-text-muted);
}

.muted-msg {
  font-size: 11px;
  color: var(--ink-text-muted);
  line-height: 1.4;
}

.ai-diff-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diff-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: var(--ink-surface);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.diff-toggle:hover {
  background: var(--ink-accent-soft);
  border-color: var(--ink-border-strong);
}

.diff-toggle-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-text);
  flex-shrink: 0;
}

.diff-toggle-summary {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--ink-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-toggle-chevron {
  font-size: 14px;
  line-height: 1;
  color: var(--ink-text-muted);
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.diff-toggle-chevron.expanded {
  transform: rotate(-90deg);
}

.diff-container {
  border: 1px solid var(--ink-border);
  border-radius: 6px;
  background: var(--ink-surface);
  overflow: hidden;
}

.diff-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-text-muted);
  padding: 4px 8px;
  background: var(--ink-bg);
  border-bottom: 1px solid var(--ink-border);
}

.diff-sub-block {
  border-bottom: 1px solid var(--ink-border);
}

.diff-sub-block:last-child {
  border-bottom: none;
}

.diff-sub-title {
  font-size: 9px;
  font-weight: 600;
  color: var(--ink-text-muted);
  padding: 2px 8px;
  background: var(--ink-surface);
  opacity: 0.8;
}

.diff-lines {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.diff-line {
  display: flex;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  padding: 1px 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-sign {
  width: 12px;
  flex-shrink: 0;
  user-select: none;
  opacity: 0.7;
}

.diff-content {
  flex: 1;
}

.diff-type-removed {
  background: color-mix(in srgb, #e53e3e 8%, transparent);
  color: #c53030;
}

.diff-type-added {
  background: color-mix(in srgb, #38a169 8%, transparent);
  color: #2f855a;
}

.diff-type-normal {
  color: var(--ink-text-muted);
  opacity: 0.85;
}

.diff-type-ellipsis {
  color: var(--ink-text-muted);
  opacity: 0.5;
  font-style: italic;
  font-size: 10px;
  justify-content: center;
  padding: 4px 8px;
  background: var(--ink-bg);
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  align-items: center;
}

.applied-badge {
  font-size: 10px;
  font-weight: 600;
  color: #2f855a;
  background: color-mix(in srgb, #38a169 12%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
}

.ai-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  transition: all 0.15s ease;
  white-space: nowrap;
  border: none;
  cursor: pointer;
}

.ai-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-btn-primary {
  background: var(--ink-accent);
  color: #fff;
  padding: 6px 14px;
}

.ai-btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}

.ai-btn-stop {
  background: var(--ink-border-strong);
  color: var(--ink-text-muted);
  align-self: flex-start;
}

.ai-btn-stop:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.ai-btn-apply {
  background: var(--ink-accent);
  color: #fff;
}

.ai-btn-apply:hover {
  opacity: 0.85;
}

.ai-btn-ghost {
  background: transparent;
  color: var(--ink-text-muted);
}

.ai-btn-ghost:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.ai-input-area {
  border-top: 1px solid var(--ink-border);
  padding: 12px;
  background: var(--ink-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.ai-input {
  width: 100%;
  min-height: 60px;
  max-height: 120px;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  line-height: 1.5;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border-strong);
  border-radius: 8px;
  color: var(--ink-text);
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.ai-input:focus {
  border-color: var(--ink-accent);
}

.ai-input:disabled {
  opacity: 0.6;
}

.ai-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
