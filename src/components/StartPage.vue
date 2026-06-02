<script setup lang="ts">
defineProps<{
  recentFiles: string[];
}>();

const emit = defineEmits<{
  newDoc: [];
  open: [];
  openRecent: [path: string];
  clearRecent: [];
}>();

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function parentPath(path: string): string {
  const parts = path.split(/[/\\]/);
  parts.pop();
  return parts.join("/");
}
</script>

<template>
  <section class="start-page" aria-label="开始">
    <div class="start-panel">
      <div class="start-main">
        <p class="eyebrow">Sheaf</p>
        <h1>开始写作</h1>
        <p class="intro">
          新建一篇 Markdown，或打开本地文件继续排版和导出。
        </p>

        <div class="actions">
          <button class="primary-action" @click="emit('newDoc')">
            新建文档
          </button>
          <button class="secondary-action" @click="emit('open')">
            打开 Markdown
          </button>
        </div>
      </div>

      <div class="recent-section">
        <div class="recent-header">
          <div>
            <h2>最近文档</h2>
            <p>只记录路径，不接管你的文件。</p>
          </div>
          <button
            v-if="recentFiles.length > 0"
            class="clear-btn"
            @click="emit('clearRecent')"
          >
            清除
          </button>
        </div>

        <div v-if="recentFiles.length === 0" class="empty-recent">
          暂无最近文档
        </div>
        <button
          v-for="path in recentFiles"
          v-else
          :key="path"
          class="recent-item"
          @click="emit('openRecent', path)"
        >
          <span class="recent-name">{{ fileName(path) }}</span>
          <span class="recent-path">{{ parentPath(path) }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.start-page {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  overflow: auto;
}

.start-panel {
  width: min(620px, 100%);
  max-height: min(720px, calc(100% - 64px));
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 18px;
  box-shadow: 0 18px 48px var(--ink-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.start-main {
  padding: 38px 40px 32px;
  text-align: center;
  flex-shrink: 0;
}

.eyebrow {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-accent);
}

h1 {
  margin-bottom: 12px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.03em;
}

.intro {
  max-width: 32em;
  margin: 0 auto;
  color: var(--ink-text-muted);
  line-height: 1.7;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
}

.primary-action,
.secondary-action {
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s;
}

.primary-action {
  color: var(--ink-surface);
  background: var(--ink-accent);
}

.secondary-action {
  color: var(--ink-text);
  border: 1px solid var(--ink-border-strong);
}

.primary-action:hover,
.secondary-action:hover {
  transform: translateY(-1px);
}

.secondary-action:hover {
  background: var(--ink-accent-soft);
  border-color: var(--ink-accent);
}

.recent-section {
  padding: 22px 24px 24px;
  border-top: 1px solid var(--ink-border);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.recent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.recent-header h2 {
  margin-bottom: 4px;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.recent-header p {
  color: var(--ink-text-muted);
  font-size: 12px;
}

.clear-btn {
  padding: 6px 10px;
  color: var(--ink-text-muted);
  font-size: 12px;
  border-radius: 8px;
}

.clear-btn:hover {
  color: var(--ink-text);
  background: var(--ink-accent-soft);
}

.empty-recent {
  padding: 36px 12px;
  color: var(--ink-text-muted);
  text-align: center;
  border: 1px dashed var(--ink-border-strong);
  border-radius: 12px;
}

.recent-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  gap: 4px;
  padding: 12px;
  color: var(--ink-text);
  text-align: left;
  border-radius: 12px;
}

.recent-item:hover {
  background: var(--ink-accent-soft);
}

.recent-name {
  max-width: 100%;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-path {
  max-width: 100%;
  color: var(--ink-text-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .start-page {
    padding: 28px;
  }
}
</style>
