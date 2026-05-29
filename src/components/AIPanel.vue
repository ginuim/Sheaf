<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from "vue";
import {
  explainNoChanges,
  useAI,
  applyChangesToDoc,
  isFullDocChange,
  lineDiff,
  compressDiff,
  type EditChange,
  type AIHistoryItem
} from "../composables/useAI";

const props = defineProps<{
  doc: string;
}>();

const emit = defineEmits<{
  apply: [changes: EditChange[]];
}>();

const { streamEdit, historyList } = useAI();

const instruction = ref("");
const listRef = ref<HTMLElement | null>(null);
let activeAbortController: AbortController | null = null;

const isLoading = computed(() => historyList.value.some((item: AIHistoryItem) => item.status === "loading"));

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
    rawResponse: "",
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
      activeAbortController.signal,
    );

    const target = historyList.value.find((item: AIHistoryItem) => item.id === id);
    if (target) {
      if (changes.length === 0) {
        target.noChangesHint = explainNoChanges(target.originalDoc, target.rawResponse);
        target.status = "no-changes";
      } else {
        target.changes = changes;
        target.status = "done";
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
  emit("apply", item.changes);
  item.status = "applied";
}

function discardItem(item: AIHistoryItem) {
  item.status = "discarded";
}

function deleteItem(id: string) {
  const idx = historyList.value.findIndex((item: AIHistoryItem) => item.id === id);
  if (idx !== -1) {
    historyList.value.splice(idx, 1);
  }
}

function clearHistory() {
  historyList.value = [];
}

function stop() {
  activeAbortController?.abort();
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void submit();
  }
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

onMounted(() => {
  scrollToBottom();
});
</script>

<template>
  <aside class="ai-panel">
    <header class="ai-header">
      <span>AI 历史与编辑</span>
      <button
        v-if="historyList.length > 0"
        class="ai-clear-btn"
        title="清空历史记录"
        @click="clearHistory"
      >
        清空
      </button>
    </header>

    <!-- 历史消息列表滚动区 -->
    <div ref="listRef" class="ai-history-list">
      <div v-if="historyList.length === 0" class="ai-empty">
        <div class="ai-empty-title">无编辑历史</div>
        <div class="ai-empty-desc">在下方输入指令，让 AI 帮您快速、精准地进行排版和内容重塑。</div>
      </div>

      <div
        v-for="item in historyList"
        :key="item.id"
        class="history-card"
        :class="`status-${item.status}`"
      >
        <!-- 卡片头部：指令 + 时间 + 删除 -->
        <div class="card-header">
          <div class="card-instruction" :title="item.instruction">
            <span class="user-tag">指令</span>
            {{ item.instruction }}
          </div>
          <div class="card-meta">
            <span class="card-time">{{ formatTime(item.timestamp) }}</span>
            <button class="card-delete-btn" title="删除记录" @click="deleteItem(item.id)">×</button>
          </div>
        </div>

        <!-- 卡片主体 -->
        <div class="card-body">
          <!-- loading 状态：流式输出 -->
          <div v-if="item.status === 'loading'" class="ai-stream">
            <div class="ai-stream-text">{{ item.rawResponse }}<span class="ai-cursor" /></div>
            <button class="ai-btn ai-btn-stop" @click="stop">停止</button>
          </div>

          <!-- error 状态 -->
          <div v-else-if="item.status === 'error'" class="ai-error-box">
            <span class="error-label">出错</span>
            <div class="error-msg">{{ item.errorMsg }}</div>
          </div>

          <!-- no-changes 状态 -->
          <div v-else-if="item.status === 'no-changes'" class="ai-muted-box">
            <span class="muted-label">评估无需修改</span>
            <div class="muted-msg">{{ item.noChangesHint || "原文已符合要求，未做任何改动。" }}</div>
          </div>

          <!-- discarded 状态 -->
          <div v-else-if="item.status === 'discarded'" class="ai-muted-box">
            <span class="muted-label">已忽略</span>
          </div>

          <!-- done / applied 状态：Diff 展示 -->
          <div v-else-if="item.status === 'done' || item.status === 'applied'" class="ai-diff-box">
            <div class="diff-container">
              <!-- 全文替换 -->
              <div v-if="isFullDocChange(item.changes, item.originalDoc)" class="diff-block">
                <div class="diff-title">全文修改（已折叠相同行）：</div>
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

              <!-- 局部替换 -->
              <div v-else class="diff-block">
                <div class="diff-title">找到 {{ item.changes.length }} 处修改：</div>
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

            <!-- 卡片操作按钮 -->
            <div class="card-actions">
              <span v-if="item.status === 'applied'" class="applied-badge">已应用</span>
              <template v-else>
                <button class="ai-btn ai-btn-apply" @click="applyItemChanges(item)">应用</button>
                <button class="ai-btn ai-btn-ghost" @click="discardItem(item)">忽略</button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="ai-input-area">
      <textarea
        v-model="instruction"
        class="ai-input"
        placeholder="描述你想做的修改…&#10;⌘↵ 发送"
        :disabled="isLoading"
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
  transition: all 0.15s ease;
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
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
