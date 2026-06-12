<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { ChevronDown, FilePlus, FolderOpen, History, ListTree, Save, WholeWord } from "@lucide/vue";
import { useLocale } from "../composables/useLocale";

export type ViewMode = "split" | "edit" | "preview";

const iconSize = 16;

defineProps<{
  fileName: string;
  isDirty: boolean;
  viewMode: ViewMode;
  isDark: boolean;
  exporting: boolean;
  showOutline: boolean;
  showExport: boolean;
  showAI: boolean;
  showVersions: boolean;
  hasVersions: boolean;
}>();

const emit = defineEmits<{
  newDoc: [];
  open: [];
  save: [];
  formatSpacing: [];
  exportPdf: [];
  openExport: [];
  toggleTheme: [];
  toggleOutline: [];
  toggleAI: [];
  toggleVersions: [];
  "update:viewMode": [mode: ViewMode];
}>();

const { t } = useLocale();

const modes = computed(() => [
  { id: "split" as const, label: t("toolbar.viewSplit") },
  { id: "edit" as const, label: t("toolbar.viewEdit") },
  { id: "preview" as const, label: t("toolbar.viewPreview") },
]);

const exportMenuOpen = ref(false);
const exportMenuRef = ref<HTMLElement | null>(null);

function toggleExportMenu() {
  exportMenuOpen.value = !exportMenuOpen.value;
}

function closeExportMenu() {
  exportMenuOpen.value = false;
}

function onOpenSocialExport() {
  closeExportMenu();
  emit("openExport");
}

function onExportPdf() {
  closeExportMenu();
  emit("exportPdf");
}

function onDocumentClick(event: MouseEvent) {
  if (!exportMenuRef.value?.contains(event.target as Node)) {
    closeExportMenu();
  }
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onUnmounted(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-left">
      <button
        class="btn btn-icon"
        :title="`${t('toolbar.newDoc')} (⌘N)`"
        :aria-label="t('toolbar.newDoc')"
        @click="emit('newDoc')"
      >
        <FilePlus :size="iconSize" aria-hidden="true" />
      </button>
      <button
        class="btn btn-icon"
        :title="`${t('toolbar.openFile')} (⌘O)`"
        :aria-label="t('toolbar.openFile')"
        @click="emit('open')"
      >
        <FolderOpen :size="iconSize" aria-hidden="true" />
      </button>
      <button
        class="btn btn-icon"
        :title="`${t('toolbar.save')} (⌘S)`"
        :aria-label="t('toolbar.save')"
        @click="emit('save')"
      >
        <Save :size="iconSize" aria-hidden="true" />
      </button>
      <button
        class="btn btn-icon"
        :title="`${t('toolbar.formatSpacing')} (⌘⇧Space)`"
        :aria-label="t('toolbar.formatSpacing')"
        @click="emit('formatSpacing')"
      >
        <WholeWord :size="iconSize" aria-hidden="true" />
      </button>
    </div>

    <div class="toolbar-center">
      <span class="doc-title">
        {{ fileName }}<span v-if="isDirty" class="dirty"> ·</span>
      </span>
    </div>

    <div class="toolbar-right">
      <button
        class="btn btn-icon btn-ghost versions-toggle"
        :class="{ active: showVersions }"
        :disabled="!hasVersions"
        :title="t('toolbar.versionHistory')"
        :aria-label="t('toolbar.versionHistory')"
        @click="emit('toggleVersions')"
      >
        <History :size="iconSize" aria-hidden="true" />
      </button>
      <button
        class="btn btn-ghost ai-toggle"
        :class="{ active: showAI }"
        :title="`${t('toolbar.aiEdit')} (⌘⇧A)`"
        @click="emit('toggleAI')"
      >
        AI
      </button>
      <div ref="exportMenuRef" class="export-menu">
        <button
          class="btn btn-ghost export-toggle"
          :class="{ active: showExport || exportMenuOpen }"
          :title="t('toolbar.export')"
          aria-haspopup="menu"
          :aria-expanded="exportMenuOpen"
          @click.stop="toggleExportMenu"
        >
          <span>{{ t("toolbar.export") }}</span>
          <ChevronDown
            :size="14"
            class="export-chevron"
            :class="{ open: exportMenuOpen }"
            aria-hidden="true"
          />
        </button>
        <div v-if="exportMenuOpen" class="export-dropdown" role="menu">
          <button
            class="export-dropdown-item"
            role="menuitem"
            @click="onOpenSocialExport"
          >
            {{ t("toolbar.exportSocial") }}
          </button>
          <button
            class="export-dropdown-item"
            role="menuitem"
            :disabled="exporting"
            @click="onExportPdf"
          >
            {{ exporting ? t("toolbar.exporting") : t("toolbar.exportPdf") }}
          </button>
        </div>
      </div>
      <button
        class="btn btn-icon btn-ghost outline-toggle"
        :class="{ active: showOutline }"
        :title="t('toolbar.outline')"
        :aria-label="t('toolbar.outline')"
        @click="emit('toggleOutline')"
      >
        <ListTree :size="iconSize" aria-hidden="true" />
      </button>
      <button
        class="btn btn-icon theme-toggle"
        :title="isDark ? t('toolbar.themeLight') : t('toolbar.themeDark')"
        :aria-label="isDark ? t('toolbar.themeLight') : t('toolbar.themeDark')"
        @click="emit('toggleTheme')"
      >
        {{ isDark ? "☀" : "☾" }}
      </button>
      <div class="view-switch" role="group" :aria-label="t('toolbar.viewMode')">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="view-btn"
          :class="{ active: viewMode === mode.id }"
          @click="emit('update:viewMode', mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  position: relative;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 var(--space-md);
  background: var(--ink-surface);
  border-bottom: 1px solid var(--ink-border);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  flex: 1;
}

.toolbar-center {
  justify-content: center;
}

.toolbar-right {
  justify-content: flex-end;
  gap: 8px;
}

.toolbar-left,
.toolbar-right {
  gap: 4px;
  -webkit-app-region: no-drag;
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-text);
  border-radius: 6px;
  transition: background 0.15s;
}

.btn:hover {
  background: var(--ink-accent-soft);
}

.btn-ghost {
  color: var(--ink-text-muted);
  font-weight: 400;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  border-radius: 6px;
}

.doc-title {
  font-size: 13px;
  color: var(--ink-text-muted);
  letter-spacing: 0.02em;
  user-select: none;
}

.dirty {
  color: var(--ink-accent);
  font-weight: 600;
}

.view-switch {
  display: flex;
  background: var(--ink-bg);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.view-btn {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text-muted);
  border-radius: 6px;
  transition: all 0.15s;
}

.view-btn:hover {
  color: var(--ink-text);
}

.view-btn.active {
  background: var(--ink-surface);
  color: var(--ink-text);
  box-shadow: 0 1px 3px var(--ink-shadow);
}

.outline-toggle.active,
.versions-toggle.active,
.export-toggle.active,
.ai-toggle.active {
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
}

.export-menu {
  position: relative;
}

.export-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.export-chevron {
  transition: transform 0.15s;
}

.export-chevron.open {
  transform: rotate(180deg);
}

.export-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  min-width: 160px;
  padding: 4px;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--ink-shadow);
}

.export-dropdown-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 400;
  color: var(--ink-text);
  text-align: left;
  border-radius: 6px;
  transition: background 0.15s;
}

.export-dropdown-item:hover:not(:disabled) {
  background: var(--ink-accent-soft);
}

.export-dropdown-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
