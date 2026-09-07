const maxDetailChars = 6_000;

function truncate(text: string, max = maxDetailChars) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[已截断，共 ${text.length} 字符]`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function isToolErrorOutput(output: unknown): boolean {
  const record = asRecord(output);
  return record?.ok === false;
}

export function formatToolResultSummary(toolName: string, output: unknown): string {
  const record = asRecord(output);
  if (!record) return "done";

  if (record.ok === false && typeof record.error === "string") {
    return record.error;
  }

  if (typeof record.summary === "string" && record.summary.trim()) {
    return record.summary.trim();
  }

  switch (toolName) {
    case "read":
      return "已读取文档";
    case "grep":
      return typeof record.matchCount === "number"
        ? `${record.matchCount} 处匹配`
        : "已搜索";
    case "edit":
      return typeof record.count === "number" ? `已替换 ${record.count} 处` : "已准备替换";
    case "write":
      return "已准备全文覆盖";
    case "web_search":
      return `${typeof record.count === "number" ? record.count : "?"} 条 · ${String(record.provider ?? "search")}`;
    case "fetch_url":
      return typeof record.url === "string" ? record.url : "已抓取链接";
    case "generate_image":
      return typeof record.src === "string" ? "图片已生成" : "生图完成";
    case "list_notes":
      return Array.isArray(record.notes) ? `${record.notes.length} 篇笔记` : "已列出笔记";
    default:
      return "done";
  }
}

export function formatToolResultDetail(toolName: string, output: unknown): string | undefined {
  const record = asRecord(output);
  if (!record) {
    if (output == null) return undefined;
    return truncate(String(output));
  }

  if (record.ok === false) {
    return typeof record.error === "string" ? record.error : JSON.stringify(record, null, 2);
  }

  if (typeof record.content === "string" && record.content.trim()) {
    return truncate(record.content);
  }

  switch (toolName) {
    case "fetch_url": {
      const parts = [
        typeof record.url === "string" ? `URL: ${record.url}` : "",
        typeof record.status === "number" ? `HTTP: ${record.status}` : "",
        typeof record.mode === "string" ? `模式: ${record.mode}` : "",
      ].filter(Boolean);
      if (typeof record.content === "string") parts.push("", record.content);
      return truncate(parts.join("\n"));
    }
    case "web_search": {
      const parts = [
        typeof record.query === "string" ? `搜索词: ${record.query}` : "",
        typeof record.provider === "string" ? `来源: ${record.provider}` : "",
        typeof record.mode === "string" ? `环境: ${record.mode}` : "",
      ].filter(Boolean);
      if (typeof record.content === "string") parts.push("", record.content);
      return parts.length > 0 ? truncate(parts.join("\n")) : truncate(JSON.stringify(record, null, 2));
    }
    case "edit":
    case "write":
    case "generate_image":
      return truncate(JSON.stringify(record, null, 2));
    case "list_notes":
      return truncate(JSON.stringify(record.notes ?? record, null, 2));
    default:
      return truncate(JSON.stringify(record, null, 2));
  }
}
