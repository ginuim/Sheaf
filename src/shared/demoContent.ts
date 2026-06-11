import type { AppLocale } from "../i18n";

const DEMO_MARKDOWN_ZH = `# Sheaf 写作示例

一款注重排版与留白的 Markdown 编辑器。

## 实时分屏

左侧编辑，右侧用 **Source Serif** 渲染预览，长文阅读更舒适。

> 好的排版让文字呼吸。
> 留白不是浪费，是给思考的空间。

## AI 辅助改写

选中段落，用自然语言描述修改意图，AI 返回可审阅的 diff。

\`\`\`typescript
const draft = "# 第一章\\n\\n正文…";
export function render(md: string) {
  return preview(md);
}
\`\`\`

---

用 **打开** 读取本地文件，**导出 PDF** 一键成稿。`;

const DEMO_MARKDOWN_EN = `# Sheaf Writing Sample

A Markdown editor focused on typography and whitespace.

## Live split view

Edit on the left; preview renders in **Source Serif** on the right for comfortable long reads.

> Good typography lets text breathe.
> Whitespace is not wasted — it gives room to think.

## AI-assisted rewriting

Select a paragraph, describe your edit in plain language, and review the diff AI returns.

\`\`\`typescript
const draft = "# Chapter 1\\n\\nBody text…";
export function render(md: string) {
  return preview(md);
}
\`\`\`

---

Use **Open** to read local files; **Export PDF** for one-click output.`;

/** 官网与产品演示共用的示例 Markdown */
export const DEMO_MARKDOWN = DEMO_MARKDOWN_ZH;

export function getDemoMarkdown(locale: AppLocale): string {
  return locale === "zh-CN" ? DEMO_MARKDOWN_ZH : DEMO_MARKDOWN_EN;
}
