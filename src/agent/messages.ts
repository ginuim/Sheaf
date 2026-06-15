import { buildEditorContextText } from "./context";
import type { AgentContextSnippet, AgentHistoryMessage } from "./types";

type AgentModelMessage = {
  role: "user" | "assistant";
  content: string;
};

const maxHistoryMessages = 20;
const maxHistoryTextChars = 4_000;
const maxContextTextChars = 12_000;

function truncateHistoryText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxHistoryTextChars) return trimmed;
  return `${trimmed.slice(0, maxHistoryTextChars)}\n\n[已截断]`;
}

export function buildAgentHistoryMessages(history: AgentHistoryMessage[]): AgentModelMessage[] {
  return history
    .filter((message) => message.text.trim().length > 0)
    .slice(-maxHistoryMessages)
    .map((message) => ({
      role: message.role,
      content: truncateHistoryText(message.text),
    }));
}

export function buildAgentTurnMessages(
  history: AgentHistoryMessage[],
  prompt: string,
  doc: string,
  documentPath: string | null,
  contexts: AgentContextSnippet[] = [],
): AgentModelMessage[] {
  const trimmedPrompt = prompt.trim();
  const contextBlock = formatContextBlock(contexts);
  const request = [
    trimmedPrompt,
    contextBlock,
    "",
    "[执行要求]",
    "请根据用户请求自行判断任务类型。",
    "如果用户要写入、修改、翻译、润色、续写、生成正文或更新当前文档，必须调用编辑工具生成 diff 预览，不要只在聊天里输出正文。",
    "如果用户只是提问、解释或闲聊，可以直接回复文字。",
    "只有用户明确需要外部资料、最新信息、来源、链接或网页内容时，才使用 web_search / fetch_url；处理当前文档本身不需要联网。",
  ].join("\n");

  const docContext = buildEditorContextText(doc, documentPath);

  return [
    ...buildAgentHistoryMessages(history),
    {
      role: "user",
      content: [
        "当前文档:",
        docContext,
        "",
        "---",
        "",
        `用户请求:\n${request}`,
      ].join("\n"),
    },
  ];
}

function truncateContextText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxContextTextChars) return normalized;
  return `${normalized.slice(0, maxContextTextChars)}\n\n[已截断，共 ${normalized.length} 字符]`;
}

function formatContextBlock(contexts: AgentContextSnippet[]): string {
  const validContexts = contexts.filter((context) => context.text.trim());
  if (validContexts.length === 0) return "";

  const blocks = validContexts.map((context, index) =>
    [
      `[上下文 ${index + 1}]`,
      `来源: ${context.documentPath ?? "当前未保存文档"}`,
      `范围: ${context.from}-${context.to}`,
      "",
      truncateContextText(context.text),
    ].join("\n"),
  );

  return [
    "[用户手动添加的选区上下文]",
    "以下内容来自用户在当前文档中选中的片段。回答或编辑时优先参考它，但所有实际修改仍必须基于当前文档定位。",
    "",
    ...blocks,
  ].join("\n");
}
