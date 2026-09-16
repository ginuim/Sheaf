const maxFullDocChars = 10_000;
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

export function buildEditorContextText(doc: string, documentPath: string | null): string {
  const lineCount = doc.split("\n").length;
  const includeBody = doc.length <= maxFullDocChars;
  const header = [
    `路径: ${documentPath ?? "未保存"}`,
    `字符数: ${doc.length}`,
    `行数: ${lineCount}`,
    includeBody ? "状态: 完整正文已附带" : "状态: 正文未附带（文档较长）",
    "标题大纲:",
    buildDocumentOutline(doc),
  ];

  if (includeBody) {
    return [...header, "", "正文:", doc].join("\n");
  }

  return [
    ...header,
    "",
    "正文未附带。用 grep 搜索关键词或标题，再用 read 按行读取（offset 从 1 计）。",
  ].join("\n");
}
