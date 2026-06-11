import type { AppLocale } from "../../i18n";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

const CHANGELOG_ZH: ChangelogEntry[] = [
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
