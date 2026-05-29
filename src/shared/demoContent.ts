/** 官网与产品演示共用的示例 Markdown */
export const DEMO_MARKDOWN = `# Sheaf 写作示例

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
