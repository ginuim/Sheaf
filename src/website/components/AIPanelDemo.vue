<script setup lang="ts">
defineProps<{
  instruction?: string;
  streamPreview?: string;
  changeCount?: number;
}>();
</script>

<template>
  <aside class="ai-panel">
    <header class="ai-header">AI 编辑</header>
    <div class="ai-body">
      <div class="ai-input ai-input-static">
        {{ instruction ?? "把第二段改得更简洁，保留引用块" }}
      </div>
      <div class="ai-actions">
        <span class="ai-btn ai-btn-primary ai-btn-static">发送</span>
      </div>
      <div v-if="streamPreview" class="ai-stream">
        <div class="ai-stream-text">{{ streamPreview }}</div>
      </div>
      <div class="ai-result ai-result-ok">
        <span>找到 {{ changeCount ?? 2 }} 处修改</span>
        <div class="ai-result-actions">
          <span class="ai-btn ai-btn-apply ai-btn-static">应用</span>
          <span class="ai-btn ai-btn-ghost ai-btn-static">取消</span>
        </div>
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
}

.ai-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow: hidden;
}

.ai-input-static {
  min-height: 72px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border-strong);
  border-radius: 8px;
  color: var(--ink-text);
}

.ai-actions {
  display: flex;
}

.ai-btn-static {
  pointer-events: none;
}

.ai-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
}

.ai-btn-primary,
.ai-btn-apply {
  background: var(--ink-accent);
  color: #fff;
}

.ai-btn-ghost {
  color: var(--ink-text-muted);
}

.ai-stream {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  background: var(--ink-bg);
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  color: var(--ink-text-muted);
  max-height: 88px;
  overflow: hidden;
}

.ai-stream-text {
  white-space: pre-wrap;
}

.ai-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.ai-result-ok {
  background: color-mix(in srgb, var(--ink-accent) 12%, transparent);
}

.ai-result-actions {
  display: flex;
  gap: 4px;
}
</style>
