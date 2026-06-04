import { buildEditorContextText } from "./context";
import { looksLikeDocumentWriteTask } from "./intent";
import type { AgentHistoryMessage } from "./types";

type AgentModelMessage = {
  role: "user" | "assistant";
  content: string;
};

const maxHistoryMessages = 20;
const maxHistoryTextChars = 4_000;

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
): AgentModelMessage[] {
  const trimmedPrompt = prompt.trim();
  const writeTask = looksLikeDocumentWriteTask(trimmedPrompt);
  const request = writeTask
    ? [
        trimmedPrompt,
        "",
        "[任务类型：文档写作]",
        "正文已在下方提供；请直接 append_content 或 propose_edits 写入，不要只在回复里输出正文。",
      ].join("\n")
    : trimmedPrompt;

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
