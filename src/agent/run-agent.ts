import { ToolLoopAgent, stepCountIs } from "ai";
import {
  formatToolResultDetail,
  formatToolResultSummary,
  isToolErrorOutput,
} from "./activity-format";
import { errorMessage, throwIfAborted, throwUserFacingError } from "./errors";
import { buildAgentTurnMessages } from "./messages";
import { createAgentLanguageModel, createReasoningProviderOptions } from "./model";
import { resolveImageModel } from "../ai-providers/resolve";
import { buildWorkspaceNotes, createSheafAgentTools } from "./tools";
import type { AgentActivity, AgentRunInput, AgentRunResult, AgentToolRuntime } from "./types";

const AGENT_SYSTEM = [
  "你是 Sheaf 的 Markdown 助手，在用户的本地编辑器中运行。",
  "工具：grep 按行搜索；read 按行读取（offset 从 1 计）；edit 用唯一原文 old_string 替换为 new_string；write 覆盖全文；list_notes 列出可访问笔记；web_search / fetch_url 查资料；generate_image 按描述生图（需已配置生图模型）。",
  "读写范围仅限当前文档和 list_notes 返回的笔记。不能执行命令，不能读取白名单外的文件。其他笔记只读，只有当前文档可以 edit / write。",
  "短文上下文可能已附带全文，可直接 edit。长文先 grep 或 read，不要猜测正文。",
  "用户要求写入、修改、插入、重写、起草、完善、补充或结合资料更新文档时，必须调用 edit 或 write 准备编辑器 diff 预览，不要只在聊天里输出正文。",
  "局部修改用 edit：old_string 必须与文档完全一致（含空格和换行），且默认全局唯一。插入时把插入点前后的唯一原文放进 old_string。多处相同替换才用 replace_all。空文档或明确的全文重写才用 write。",
  "用户要求插图、配图、生成图片时：先 generate_image，再用 edit 把返回的 Markdown 图片语法插入文档。",
  "需要最新事实或外部资料时：先 web_search；若摘要不够，再 fetch_url 抓取最相关的 1-2 个链接。",
  "web_search 返回了预报或正文时，必须基于结果回答并标注来源；不要回复「查不到」或让用户自己去网站看。",
  "翻译、润色、改写或续写当前文档时，不要使用 web_search / fetch_url；只有用户明确要求联网、查资料、最新信息、来源、链接或网页内容时才使用联网工具。",
  "不要声称已读文件、已改文档或已搜索网页，除非对应工具返回成功。",
  "即使外部资料不完整，也要基于已获取信息做最佳修改，并在回复中说明不确定之处；不要因资料不完美就放弃改文档。",
  "纯问答（解释概念、闲聊、不要求改文档）可以只输出文字。",
  "改动会进入编辑器 diff 预览，由用户确认后才写入文件。",
  "用户可见回复使用其使用的语言，简洁务实。",
  "改文档成功后简短说明改了什么；若未改文档，说明原因。",
].join("\n");

function compactText(text: string, max = 80): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function upsertActivity(
  activities: AgentActivity[],
  activity: AgentActivity,
  onActivity?: (activity: AgentActivity) => void,
) {
  const index = activities.findIndex((item) => item.id === activity.id);
  if (index >= 0) {
    activities[index] = { ...activities[index], ...activity };
    onActivity?.({ ...activities[index] });
    return;
  }
  activities.push(activity);
  onActivity?.(activity);
}

function closeOpenThinking(activities: AgentActivity[], onActivity?: (activity: AgentActivity) => void) {
  for (const activity of activities) {
    if (activity.kind === "thinking" && activity.status === "running") {
      activity.status = "done";
      activity.summary = activity.detail ? compactText(activity.detail) : activity.summary;
      onActivity?.({ ...activity });
    }
  }
}

function trackStreamPart(
  part: {
    type: string;
    id?: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    delta?: string;
  },
  activities: AgentActivity[],
  contentOffset: number,
  nextTimelineSeq: () => number,
  onActivity?: (activity: AgentActivity) => void,
) {
  if (part.type === "reasoning-start" && part.id) {
    const id = `thinking-${part.id}`;
    if (activities.some((activity) => activity.id === id)) return;
    upsertActivity(
      activities,
      {
        id,
        kind: "thinking",
        tool: "thinking",
        status: "running",
        detail: "",
        contentOffset,
        timelineSeq: nextTimelineSeq(),
      },
      onActivity,
    );
    return;
  }

  if (part.type === "reasoning-delta" && part.text) {
    const id = `thinking-${part.id ?? "default"}`;
    const existing = activities.find((activity) => activity.id === id);
    const detail = `${existing?.detail ?? ""}${part.text}`;
    upsertActivity(
      activities,
      {
        id,
        kind: "thinking",
        tool: "thinking",
        status: "running",
        summary: undefined,
        detail,
        contentOffset: existing?.contentOffset ?? contentOffset,
        timelineSeq: existing?.timelineSeq ?? nextTimelineSeq(),
      },
      onActivity,
    );
    return;
  }

  if (part.type === "reasoning-end") {
    const id = `thinking-${part.id ?? "default"}`;
    const existing = activities.find((activity) => activity.id === id);
    if (!existing) return;
    upsertActivity(
      activities,
      {
        ...existing,
        status: "done",
        summary: existing.detail ? compactText(existing.detail) : undefined,
      },
      onActivity,
    );
    return;
  }

  if (part.type === "text-delta") {
    closeOpenThinking(activities, onActivity);
    return;
  }

  if (part.type === "tool-input-start" && part.id && part.toolName) {
    closeOpenThinking(activities, onActivity);
    upsertActivity(
      activities,
      {
        id: part.id,
        kind: "tool",
        tool: part.toolName,
        status: "running",
        contentOffset,
        timelineSeq: nextTimelineSeq(),
      },
      onActivity,
    );
    return;
  }

  if (part.type === "tool-input-delta" && part.id && part.delta) {
    const existing = activities.find((activity) => activity.id === part.id);
    if (!existing) return;
    upsertActivity(
      activities,
      {
        ...existing,
        detail: `${existing.detail ?? ""}${part.delta}`,
      },
      onActivity,
    );
    return;
  }

  if (part.type === "tool-call") {
    const id = part.toolCallId ?? part.id;
    if (!id) return;
    const existing = activities.find((activity) => activity.id === id);
    upsertActivity(
      activities,
      {
        ...existing,
        id,
        kind: "tool",
        tool: part.toolName ?? "tool",
        status: "running",
        detail: part.input === undefined ? undefined : formatUnknown(part.input),
        contentOffset: existing?.contentOffset ?? contentOffset,
        timelineSeq: existing?.timelineSeq ?? nextTimelineSeq(),
      },
      onActivity,
    );
    return;
  }

  if (part.type === "tool-result") {
    const id = part.toolCallId ?? part.id;
    const name = part.toolName ?? "tool";
    if (!id) return;
    const existing = activities.find((activity) => activity.id === id);
    upsertActivity(
      activities,
      {
        ...existing,
        id,
        kind: "tool",
        tool: name,
        status: isToolErrorOutput(part.output) ? "error" : "done",
        summary: formatToolResultSummary(name, part.output),
        detail: formatToolResultDetail(name, part.output),
        contentOffset: existing?.contentOffset ?? contentOffset,
        timelineSeq: existing?.timelineSeq ?? nextTimelineSeq(),
      },
      onActivity,
    );
    return;
  }

  if (part.type === "tool-error") {
    const id = part.toolCallId ?? part.id;
    if (!id) return;
    const existing = activities.find((activity) => activity.id === id);
    upsertActivity(
      activities,
      {
        ...existing,
        id,
        kind: "tool",
        tool: part.toolName ?? "tool",
        status: "error",
        summary: errorMessage(part.error),
        detail: formatUnknown(part.error),
        contentOffset: existing?.contentOffset ?? contentOffset,
        timelineSeq: existing?.timelineSeq ?? nextTimelineSeq(),
      },
      onActivity,
    );
  }
}

export async function runSheafAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const activities: AgentActivity[] = [];
  const workspaceNotes = buildWorkspaceNotes(input.workspacePaths, input.documentPath);

  const webSearch = input.webSearch ?? { enabled: true, maxResults: 4 };

  let workingDoc = input.doc;
  const runtime: AgentToolRuntime = {
    originalDoc: input.doc,
    getDoc: () => workingDoc,
    setDoc: (doc) => {
      workingDoc = doc;
    },
    documentPath: input.documentPath,
    workspaceNotes,
    readWorkspaceFile: input.readWorkspaceFile,
    pendingChanges: null,
    webSearch,
    imageModel: resolveImageModel(input.providerSettings),
    onActivity: (activity) => {
      const existingIdx = activities.findIndex((a) => a.id === activity.id);
      if (existingIdx >= 0) {
        activities[existingIdx] = activity;
      } else {
        activities.push(activity);
      }
      input.onActivity?.(activity);
    },
  };

  const model = createAgentLanguageModel(input.providerSettings);
  const maxSteps = input.maxSteps ?? 12;

  const agent = new ToolLoopAgent({
    model,
    instructions: AGENT_SYSTEM,
    tools: createSheafAgentTools(runtime),
    stopWhen: stepCountIs(maxSteps),
    providerOptions: createReasoningProviderOptions(input.providerSettings),
  });

  let assistantText = "";
  let streamError: unknown;
  let timelineSeq = 0;

  const streamResult = await agent.stream({
    messages: buildAgentTurnMessages(
      input.history ?? [],
      input.prompt,
      input.doc,
      input.documentPath,
      input.contexts,
    ),
    abortSignal: input.signal,
  });

  try {
    for await (const part of streamResult.fullStream) {
      trackStreamPart(
        part as {
          type: string;
          id?: string;
          text?: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
          output?: unknown;
          error?: unknown;
          delta?: string;
        },
        activities,
        assistantText.length,
        () => ++timelineSeq,
        input.onActivity,
      );
      if (part.type === "text-delta") {
        assistantText += part.text;
        input.onTextDelta?.(assistantText);
        continue;
      }
      if (part.type === "abort") {
        throw new DOMException("Aborted", "AbortError");
      }
      if (part.type === "error") {
        streamError = part.error;
      }
    }
  } catch (error) {
    throwUserFacingError(streamError ?? error);
  }

  if (streamError) throwUserFacingError(streamError);
  throwIfAborted(input.signal);

  let finishReason: string | undefined;
  try {
    finishReason = (await streamResult.finishReason) ?? undefined;
  } catch (error) {
    throwUserFacingError(streamError ?? error);
  }

  return {
    // 保留流中的原始字符数，确保 activity.contentOffset 在落盘后仍能准确定位。
    assistantText,
    changes: runtime.pendingChanges ?? [],
    activities,
    finishReason,
  };
}
