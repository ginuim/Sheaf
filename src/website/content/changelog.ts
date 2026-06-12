import type { AppLocale } from "../../i18n";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

const CHANGELOG_ZH: ChangelogEntry[] = [
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
