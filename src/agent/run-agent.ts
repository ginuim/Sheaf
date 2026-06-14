import { ToolLoopAgent, stepCountIs } from "ai";
import {
  formatToolResultDetail,
  formatToolResultSummary,
  isToolErrorOutput,
} from "./activity-format";
import { looksLikeDocumentWriteTask } from "./intent";
import { buildAgentTurnMessages } from "./messages";
import { createAgentLanguageModel } from "./model";
import { resolveImageModel } from "../ai-providers/resolve";
import { buildWorkspaceNotes, createSheafAgentTools } from "./tools";
import type { AgentActivity, AgentRunInput, AgentRunResult, AgentToolRuntime } from "./types";

const AGENT_SYSTEM = [
  "你是 Sheaf 的 Markdown 助手，在用户的本地编辑器中运行。",
  "工具：inspect_document_structure 查看标题/章节/段落/表格锚点；locate_content 定位目标；read_document 按锚点或范围读取正文；insert_content 插入新内容；replace_content 替换章节/段落/表格/精确原文；batch_edit 做多处小改；validate_markdown 检查结构；web_search / fetch_url 查资料；generate_image 按描述生成图片（需已配置生图模型）；get_context 仅在正文被截断时需重读；list_notes / read_note 读其他笔记。",
  "用户要求插图、配图、生成图片时：先 generate_image，再用 append_content 把返回的 Markdown 图片语法插入文档合适位置。",
  "需要最新事实或外部资料时：先 web_search；若摘要不够，再 fetch_url 抓取最相关的 1-2 个链接。",
  "web_search 返回了预报或正文时，必须基于结果回答并标注来源；不要回复「查不到」或让用户自己去网站看。",
  "不要声称已读文件、已改文档或已搜索网页，除非对应工具返回成功。",
  "用户要求写入、修改、插入、重写、起草、完善、补充或结合资料更新文档时，必须调用 insert_content、replace_content、batch_edit、append_content 或 propose_edits 准备编辑器 diff 预览，不要只在聊天里输出正文。",
  "定位不明确时，先 inspect_document_structure 或 locate_content；替换已有内容时优先使用 anchorId、headingTitle 或 exactText，不要凭空猜 from/to 偏移。",
  "新增章节/段落优先 insert_content；重写某节用 replace_content targetKind=section；改表格用 targetKind=table；多处短小替换用 batch_edit；只有用户明确要求全文重写才替换 whole-document。",
  "复杂结构改写后可调用 validate_markdown 检查候选内容或当前文档结构。",
  "即使外部资料不完整，也要基于已获取信息做最佳修改，并在回复中说明不确定之处；不要因资料不完美就放弃改文档。",
  "每轮用户消息已附带当前文档正文，一般无需 get_context；长文或目标不明确时使用结构化工具读取局部内容。",
  "纯问答（解释概念、闲聊、不要求改文档）可以只输出文字。",
  "需要改文档时，修改区间不得重叠。",
  "用户可见回复使用其使用的语言，简洁务实。",
  "改文档成功后简短说明改了什么；若未改文档，说明原因。",
].join("\n");

const WRITE_TOOLS = [
  "append_content",
  "batch_edit",
  "insert_content",
  "propose_edits",
  "replace_content",
] as const;
const DOCUMENT_EDIT_FLOW_TOOLS = [
  "inspect_document_structure",
  "locate_content",
  "read_document",
  "validate_markdown",
  ...WRITE_TOOLS,
] as const;
const RESEARCH_TOOLS = ["web_search", "fetch_url"] as const;

function stepCalledTool(steps: unknown, toolName: string) {
  if (!Array.isArray(steps)) return false;
  return steps.some((step) => {
    if (!step || typeof step !== "object") return false;
    const toolCalls = (step as { toolCalls?: unknown }).toolCalls;
    if (!Array.isArray(toolCalls)) return false;
    return toolCalls.some((call) => {
      if (!call || typeof call !== "object") return false;
      return toolNameFromCall(call as { toolName?: string; tool?: string }) === toolName;
    });
  });
}

function stepCalledWriteTool(steps: unknown) {
  return WRITE_TOOLS.some((toolName) => stepCalledTool(steps, toolName));
}

function toolNameFromCall(call: { toolName?: string; tool?: string }): string {
  return call.toolName ?? call.tool ?? "tool";
}

function trackStepTools(
  step: {
    toolCalls?: Array<{ toolCallId?: string; toolName?: string; tool?: string }>;
    toolResults?: Array<{ toolCallId?: string; toolName?: string; tool?: string; output?: unknown }>;
  },
  activities: AgentActivity[],
  onActivity?: (activity: AgentActivity) => void,
) {
  for (const call of step.toolCalls ?? []) {
    const name = toolNameFromCall(call);
    const id = call.toolCallId ?? `${name}-${activities.length}-${Date.now()}`;
    const activity: AgentActivity = {
      id,
      tool: name,
      status: "running",
    };
    activities.push(activity);
    onActivity?.(activity);
  }

  for (const result of step.toolResults ?? []) {
    const name = toolNameFromCall(result);
    const id = result.toolCallId;
    const existing = id
      ? activities.find((activity) => activity.id === id)
      : [...activities].reverse().find(
          (activity) => activity.tool === name && activity.status === "running",
        );

    const status = isToolErrorOutput(result.output) ? "error" : "done";
    const summary = formatToolResultSummary(name, result.output);
    const detail = formatToolResultDetail(name, result.output);

    if (!existing) {
      const activity: AgentActivity = {
        id: id ?? `${name}-result-${Date.now()}`,
        tool: name,
        status,
        summary,
        detail,
      };
      activities.push(activity);
      onActivity?.(activity);
      continue;
    }

    existing.status = status;
    existing.summary = summary;
    existing.detail = detail;
    onActivity?.({ ...existing });
  }
}

export async function runSheafAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const activities: AgentActivity[] = [];
  const workspaceNotes = buildWorkspaceNotes(input.workspacePaths, input.documentPath);

  const webSearch = input.webSearch ?? { enabled: true, maxResults: 4 };

  const runtime: AgentToolRuntime = {
    getDoc: () => input.doc,
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
  const writeTask = looksLikeDocumentWriteTask(input.prompt);
  const maxSteps = input.maxSteps ?? (writeTask ? 12 : 8);

  const agent = new ToolLoopAgent({
    model,
    instructions: AGENT_SYSTEM,
    tools: createSheafAgentTools(runtime),
    stopWhen: stepCountIs(maxSteps),
    prepareStep: writeTask
      ? ({ steps }) => {
          if (stepCalledWriteTool(steps)) return undefined;
          const researchTools = webSearch.enabled ? RESEARCH_TOOLS : [];
          if (Array.isArray(steps) && steps.length < 3) {
            return {
              toolChoice: "auto",
              activeTools: [...DOCUMENT_EDIT_FLOW_TOOLS, ...researchTools],
            };
          }
          return {
            toolChoice: "auto",
            activeTools: [...WRITE_TOOLS, ...researchTools],
          };
        }
      : undefined,
    onStepFinish: async (step) => {
      trackStepTools(
        {
          toolCalls: step.toolCalls as Array<{
            toolCallId?: string;
            toolName?: string;
            tool?: string;
          }> | undefined,
          toolResults: step.toolResults as Array<{
            toolCallId?: string;
            toolName?: string;
            tool?: string;
            output?: unknown;
          }> | undefined,
        },
        activities,
        input.onActivity,
      );
    },
  });

  let assistantText = "";

  const streamResult = await agent.stream({
    messages: buildAgentTurnMessages(
      input.history ?? [],
      input.prompt,
      input.doc,
      input.documentPath,
    ),
    abortSignal: input.signal,
  });

  for await (const delta of streamResult.textStream) {
    assistantText += delta;
    input.onTextDelta?.(assistantText);
  }

  const finishReason = await streamResult.finishReason;

  return {
    assistantText: assistantText.trim(),
    changes: runtime.pendingChanges ?? [],
    activities,
    finishReason: finishReason ?? undefined,
  };
}
