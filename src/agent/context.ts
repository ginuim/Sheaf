const maxDocChars = 12_000;
const maxOutlineHeadings = 40;

export function buildDocumentOutline(doc: string): string {
  const lines = doc.split("\n");
  const headings: string[] = [];

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!match) continue;
    const level = match[1].length;
    const title = match[2].trim();
    if (!title) continue;
    headings.push(`${"  ".repeat(level - 1)}- ${title}`);
    if (headings.length >= maxOutlineHeadings) break;
  }

  if (headings.length === 0) return "（无标题结构）";
  return headings.join("\n");
}

export function truncateDocument(doc: string, maxChars = maxDocChars): { text: string; truncated: boolean } {
  if (doc.length <= maxChars) {
    return { text: doc, truncated: false };
  }
  return {
    text: `${doc.slice(0, maxChars)}\n\n[正文已截断，共 ${doc.length} 字符]`,
    truncated: true,
  };
}

export function buildEditorContextText(doc: string, documentPath: string | null): string {
  const { text, truncated } = truncateDocument(doc);
  return [
    `路径: ${documentPath ?? "未保存"}`,
    `字数: ${doc.length}`,
    truncated ? "状态: 正文已截断供模型阅读" : "状态: 完整正文",
    "标题大纲:",
    buildDocumentOutline(doc),
    "",
    "正文:",
    text,
  ].join("\n");
}
