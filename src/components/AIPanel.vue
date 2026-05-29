<script setup lang="ts">
import { ref } from "vue";
import { explainNoChanges, formatEditPreview, useAI, type EditChange } from "../composables/useAI";

const props = defineProps<{
  doc: string;
}>();

const emit = defineEmits<{
  apply: [changes: EditChange[]];
}>();

const { streamEdit } = useAI();

type Status = "idle" | "loading" | "done" | "error" | "no-changes";

const instruction = ref("");
const streamText = ref("");
const status = ref<Status>("idle");
const errorMsg = ref("");
const pendingChanges = ref<EditChange[]>([]);
const noChangesHint = ref("");
let abortController: AbortController | null = null;
let lastAccumulated = "";

async function submit() {
  const text = instruction.value.trim();
  if (!text || status.value === "loading") return;

  streamText.value = "";
  errorMsg.value = "";
  noChangesHint.value = "";
  pendingChanges.value = [];
  lastAccumulated = "";
  status.value = "loading";

  abortController = new AbortController();

  try {
    const changes = await streamEdit(
      text,
      props.doc,
      (delta) => {
        lastAccumulated += delta;
        streamText.value += delta;
      },
      abortController.signal,
    );

    if (changes.length === 0) {
      noChangesHint.value = explainNoChanges(props.doc, lastAccumulated);
      status.value = "no-changes";
    } else {
      pendingChanges.value = changes;
      streamText.value = formatEditPreview(props.doc, changes);
      status.value = "done";
    }
  } catch (e: unknown) {
    if ((e as Error).name === "AbortError") {
      status.value = "idle";
    } else {
      errorMsg.value = (e as Error).message;
      status.value = "error";
    }
  } finally {
    abortController = null;
  }
}

function applyChanges() {
  emit("apply", pendingChanges.value);
  pendingChanges.value = [];
  status.value = "idle";
  streamText.value = "";
}

function stop() {
  abortController?.abort();
}

function reset() {
  status.value = "idle";
  streamText.value = "";
  errorMsg.value = "";
  noChangesHint.value = "";
  pendingChanges.value = [];
  lastAccumulated = "";
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void submit();
  }
}
</script>

<template>
  <aside class="ai-panel">
    <header class="ai-header">AI 编辑</header>

    <div class="ai-body">
      <textarea
        v-model="instruction"
        class="ai-input"
        placeholder="描述你想做的修改…&#10;⌘↵ 发送"
        :disabled="status === 'loading'"
        @keydown="onKeydown"
      />

      <div class="ai-actions">
        <button
          v-if="status !== 'loading'"
          class="ai-btn ai-btn-primary"
          :disabled="!instruction.trim()"
          @click="submit"
        >
          发送
        </button>
        <button v-else class="ai-btn ai-btn-stop" @click="stop">停止</button>
      </div>

      <div v-if="status === 'loading' || streamText" class="ai-stream">
        <div class="ai-stream-text">{{ streamText }}<span v-if="status === 'loading'" class="ai-cursor" /></div>
      </div>

      <div v-if="status === 'done'" class="ai-result ai-result-ok">
        <span>找到 {{ pendingChanges.length }} 处修改</span>
        <div class="ai-result-actions">
          <button class="ai-btn ai-btn-apply" @click="applyChanges">应用</button>
          <button class="ai-btn ai-btn-ghost" @click="reset">取消</button>
        </div>
      </div>

      <div v-else-if="status === 'no-changes'" class="ai-result ai-result-muted">
        <span class="ai-no-changes-msg">{{ noChangesHint || "无需修改" }}</span>
        <button class="ai-btn ai-btn-ghost" @click="reset">关闭</button>
      </div>

      <div v-else-if="status === 'error'" class="ai-result ai-result-error">
        <span class="ai-error-msg">{{ errorMsg }}</span>
        <button class="ai-btn ai-btn-ghost" @click="reset">关闭</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  width: 280px;
  flex-shrink: 0;
  background: var(--ink-surface);
  border-left: 1px solid var(--ink-border);
  overflow: hidden;
}

.ai-header {
  padding: 12px 16px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-text-muted);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
}

.ai-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  min-height: 0;
}

.ai-input {
  width: 100%;
  min-height: 80px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
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
  gap: 6px;
}

.ai-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.ai-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-btn-primary {
  background: var(--ink-accent);
  color: #fff;
}

.ai-btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}

.ai-btn-stop {
  background: var(--ink-border-strong);
  color: var(--ink-text-muted);
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
  color: var(--ink-text-muted);
}

.ai-btn-ghost:hover {
  background: var(--ink-accent-soft);
  color: var(--ink-text);
}

.ai-stream {
  flex: 1;
  min-height: 80px;
  padding: 8px 10px;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  line-height: 1.6;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  color: var(--ink-text-muted);
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.ai-stream-text {
  white-space: pre-wrap;
  word-break: break-all;
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

.ai-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  flex-shrink: 0;
}

.ai-result-actions {
  display: flex;
  gap: 4px;
}

.ai-result-ok {
  background: color-mix(in srgb, var(--ink-accent) 12%, transparent);
  color: var(--ink-text);
}

.ai-result-muted {
  background: var(--ink-bg);
  color: var(--ink-text-muted);
}

.ai-no-changes-msg {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
}

.ai-result-error {
  background: color-mix(in srgb, #e53e3e 10%, transparent);
  color: var(--ink-text);
}

.ai-error-msg {
  font-size: 11px;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  word-break: break-all;
}
</style>
