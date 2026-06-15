import type { AppLocale } from "../../i18n";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

const CHANGELOG_ZH: ChangelogEntry[] = [
  {
    version: "0.2.8",
    date: "2026-06",
    title: "系统标题栏主题同步",
    items: [
      "切换浅色 / 深色主题时，macOS 系统标题栏同步跟随",
      "跟随系统外观时，系统主题变化会正确更新应用与标题栏",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-06",
    title: "更新弹窗优化",
    items: [
      "发现新版本时使用应用内弹窗确认，替代系统原生对话框",
      "弹窗文案支持国际化，仅提示版本可更新",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-06",
    title: "AI 选区上下文",
    items: [
      "编辑器选区右键可添加到 AI 对话上下文，发送指令时一并参考",
      "AI 面板显示上下文 chip，可随时移除",
      "简化 Agent 任务判断逻辑，由模型自行决定编辑文档或文字回复",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-06",
    title: "AI 桌面代理与设置优化",
    items: [
      "桌面端 AI 请求经 Tauri 代理，规避浏览器 CORS 限制",
      "刷新 AI 提供商目录，移除已弃用模型，启用前需填写 API Key",
      "提供商设置自动保存，设置面板布局优化",
      "文档编辑 Agent 支持研究类工具自动调用",
      "历史指令折叠后仍可操作「应用 / 放弃」按钮",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-06",
    title: "更新体验优化",
    items: [
      "发现新版本时弹窗询问后再下载，不再自动安装",
      "修复设置页检查更新时 Toast 被遮罩层挡住",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-06",
    title: "工具栏标题显示优化",
    items: [
      "文档标题过长时在工具栏单行显示，超出部分以省略号截断",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-06",
    title: "应用内自动更新",
    items: [
      "支持后台检查、下载并安装新版本，完成后一键重启",
      "设置页可开关自动检查，菜单与设置页支持手动检查更新",
      "官网 favicon 与动态版本号展示",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-06",
    title: "工具栏优化",
    items: [
      "排版间距按钮仅在文档确实需要中英文间距格式化时显示",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06",
    title: "AI 与编辑体验增强",
    items: [
      "设置页 AI 分区拆分为「模型」与「工具」两个标签",
      "Agent 结构化文档编辑工具，支持段落级改写与 diff 审阅",
      "编辑器支持拖拽与粘贴插入图片",
      "当前文件可在 Finder 中快速定位",
      "官网新增平台下载选择器，README 补充产品截图",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06",
    title: "首个公开版本",
    items: [
      "macOS 原生 Markdown 编辑器，文件保存在本地磁盘",
      "分屏编辑与实时预览，编辑区与预览区同步滚动",
      "章节大纲面板，点击标题快速跳转",
      "三种视图：分屏、仅编辑、仅预览",
      "AI 段落改写：自然语言指令、diff 审阅、一键应用",
      "导出 PDF、微信公众号 HTML、社交媒体分享卡片与长图",
      "中英文排版间距自动补齐，支持一键格式化全文",
      "历史版本快照，可对比 diff 并恢复",
      "浅色 / 深色主题，界面支持中文与 English",
    ],
  },
];

const CHANGELOG_EN: ChangelogEntry[] = [
  {
    version: "0.2.8",
    date: "2026-06",
    title: "System title bar theme sync",
    items: [
      "Sync the macOS system title bar when switching light or dark theme",
      "Follow system appearance changes for both app UI and title bar",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-06",
    title: "Update prompt improvements",
    items: [
      "Use an in-app dialog instead of the native system prompt when updates are available",
      "Localize update prompt copy and show a concise version notice only",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-06",
    title: "AI selection context",
    items: [
      "Add editor selection to AI conversation context via right-click menu",
      "Show a context chip in the AI panel with one-click removal",
      "Simplify agent task routing so the model chooses edit tools vs chat replies",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-06",
    title: "AI desktop transport and settings",
    items: [
      "Route desktop AI requests through Tauri to avoid browser CORS limits",
      "Refresh AI provider catalog, remove deprecated models, require API keys before enabling",
      "Auto-save provider settings with improved settings panel layout",
      "Document-edit agent can use research tools with automatic tool choice",
      "Keep apply/discard actions visible when instruction cards are collapsed",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-06",
    title: "Update UX improvements",
    items: [
      "Prompt before downloading updates instead of installing automatically",
      "Fix update toasts appearing behind the Settings overlay",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-06",
    title: "Toolbar title display",
    items: [
      "Document title stays on one line in the toolbar with ellipsis when truncated",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-06",
    title: "In-app auto-update",
    items: [
      "Background update checks, downloads, and install with one-click restart",
      "Auto-check toggle in Settings; manual check from menu and Settings",
      "Website favicon and dynamic version display",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-06",
    title: "Toolbar polish",
    items: [
      "Format spacing button only shown when document needs CJK spacing formatting",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06",
    title: "AI and editing improvements",
    items: [
      "Settings AI tab split into Models and Tools",
      "Agent structured document editing with paragraph-level rewrite and diff review",
      "Editor image insertion via drag-and-drop and paste",
      "Reveal current file in Finder",
      "Website platform download picker and README product screenshots",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06",
    title: "First public release",
    items: [
      "Native macOS Markdown editor — files stay on your disk",
      "Split editing and live preview with synchronized scrolling",
      "Outline panel with click-to-jump headings",
      "Three view modes: split, edit-only, preview-only",
      "AI rewriting: natural-language instructions, diff review, one-click apply",
      "Export PDF, WeChat HTML, social share cards, and long images",
      "Automatic CJK spacing with one-click full-document formatting",
      "Version snapshots with diff compare and restore",
      "Light / dark themes; interface in Chinese and English",
    ],
  },
];

export function getChangelog(locale: AppLocale): ChangelogEntry[] {
  return locale === "zh-CN" ? CHANGELOG_ZH : CHANGELOG_EN;
}
