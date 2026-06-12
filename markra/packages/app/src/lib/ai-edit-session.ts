import type { AiAgentSessionPreview } from "@markra/ai";
import type { AiDiffResult } from "@markra/ai";
import type { AiAgentPanelMessage } from "../hooks/useAiAgentSession";

export type AiEditHistoryEntry = {
  id: string;
  messageId: number;
  preview: AiAgentSessionPreview;
  previewIndex: number;
  userPrompt: string | null;
};

export function sessionPreviewToAiResult(preview: AiAgentSessionPreview): AiDiffResult {
  return {
    from: preview.from,
    original: preview.original,
    replacement: preview.replacement,
    ...(preview.target ? { target: preview.target } : {}),
    to: preview.to,
    type: preview.type
  };
}

export function collectAiEditHistory(messages: AiAgentPanelMessage[]): AiEditHistoryEntry[] {
  const entries: AiEditHistoryEntry[] = [];

  for (const [messageIndex, message] of messages.entries()) {
    if (message.role !== "assistant") continue;

    const previews = message.previews ?? (message.preview ? [message.preview] : []);
    if (previews.length === 0) continue;

    let userPrompt: string | null = null;
    for (let index = messageIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role !== "user") continue;
      const text = candidate.text.trim();
      if (!text) continue;
      userPrompt = text;
      break;
    }

    previews.forEach((preview, previewIndex) => {
      entries.push({
        id: `${message.id}:${previewIndex}`,
        messageId: message.id,
        preview,
        previewIndex,
        userPrompt
      });
    });
  }

  return entries;
}

export function collectMessageEditEntries(
  message: AiAgentPanelMessage,
  userPrompt: string | null = null
): AiEditHistoryEntry[] {
  if (message.role !== "assistant") return [];

  const previews = message.previews ?? (message.preview ? [message.preview] : []);
  return previews.map((preview, previewIndex) => ({
    id: `${message.id}:${previewIndex}`,
    messageId: message.id,
    preview,
    previewIndex,
    userPrompt
  }));
}

export function previewTargetLabel(preview: AiAgentSessionPreview) {
  const kind = preview.target?.kind;
  if (kind === "selection") return "selection";
  if (kind === "document" || kind === "document_end") return "document";
  if (kind === "heading") return preview.target?.title?.trim() || "heading";
  if (kind === "section") return preview.target?.title?.trim() || "section";
  if (kind === "table") return preview.target?.title?.trim() || "table";
  if (kind === "current_block") return "block";
  if (preview.type === "insert") return "insert";
  return "replace";
}

export function previewSummarySnippet(preview: AiAgentSessionPreview, maxLength = 72) {
  const source = preview.replacement.trim() || preview.original.trim();
  const singleLine = source.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}
