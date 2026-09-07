import { reactive, watch, ref } from "vue";
import { streamText } from "ai";
import {
  createAgentLanguageModel,
  createReasoningProviderOptions,
  selectedModelSupportsReasoning,
} from "../agent/model";
import { runSheafAgent } from "../agent/run-agent";
import type { AgentActivity, AgentContextSnippet, AgentHistoryMessage } from "../agent/types";
import { throwIfAborted, throwUserFacingError } from "../agent/errors";
import { buildAgentHistoryMessages } from "../agent/messages";
import { resolveAgentModel } from "../ai-providers/resolve";
import {
  loadAiSettings,
  saveAiSettings,
  type AiProviderSettings,
} from "../ai-providers/settings";
import { safeSetLocalStorageItem, safeSetLocalStorageJson } from "../lib/storageBudget";
import type { ProofreadIssue, ProofreadResult } from "../types/proofreading";

export type AISettings = AiProviderSettings;

export interface EditChange {
  from: number;
  to: number;
  insert: string;
}

export interface DiffLine {
  type: "added" | "removed" | "normal";
  text: string;
}

export interface CompressedDiffLine {
  type: "added" | "removed" | "normal" | "ellipsis";
  text: string;
}

export function isBlankDocument(content: string) {
  return content.trim().length === 0;
}

/** 从空白文档到首次 AI 填内容的记录，应自动应用到编辑器。 */
export function isBlankToAiEdit(item: { originalDoc: string; changes: EditChange[] }) {
  return isBlankDocument(item.originalDoc) && item.changes.length > 0;
}

export type AIComposerMode = "quick" | "agent";
export type AIHistoryMode = AIComposerMode | "proofread";
export type ActiveConversationMap = Record<AIComposerMode, string>;

export interface AIHistoryItem {
  id: string;
  timestamp: number;
  instruction: string;
  status: "loading" | "done" | "no-changes" | "error" | "applied" | "discarded" | "cancelled" | "proofread";
  mode?: AIHistoryMode;
  conversationId?: string;
  errorMsg?: string;
  noChangesHint?: string;
  originalDoc: string;
  resultDoc?: string;
  changes: EditChange[];
  proofreadIssues?: ProofreadIssue[];
  rawResponse: string;
  assistantText?: string;
  agentActivities?: AgentActivity[];
}

export type AIConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
  turnCount: number;
};

function loadSettings(): AISettings {
  return loadAiSettings();
}

function saveSettings(s: AISettings) {
  saveAiSettings(s);
}

const CHAT_SYSTEM_PROMPT = `你是 Sheaf 的对话助手，在用户的本地 Markdown 编辑器中运行。
当前是对话模式：只能用文字回答，没有任何工具可调用。
不能使用 web_search、fetch_url、grep、read、edit、write、list_notes、generate_image，也不能执行命令或访问网络。
不要假装已经搜索过网页、抓取过链接或修改过文档。
附带的当前文档只是只读上下文，用来理解用户在写什么；不要输出 SEARCH/REPLACE，不要把回复当成要写入编辑器的新文档。
若用户要求改文档、联网查资料、打开网页或生成图片，直接说明对话模式做不到，请切换到 Agent 模式。
用用户使用的语言回复，简洁务实。`;

const PROOFREAD_SYSTEM_PROMPT = `你是中文 Markdown 文档校对助手。只检查明确的错别字、别字、重复字、漏字、明显误用词，不做风格润色，不改写句式。
必须只输出 JSON，不要输出 Markdown、解释、前言或代码块。
JSON 格式：
{
  "issues": [
    {
      "original": "文档中一字不差的错误原文，尽量只包含错字或短词",
      "suggestion": "建议替换文本",
      "reason": "简短原因",
      "context": "包含 original 的连续原句或短上下文",
      "line": 1
    }
  ]
}
如果没有明确问题，输出 {"issues": []}。`;

type RawProofreadIssue = {
  original?: unknown;
  suggestion?: unknown;
  reason?: unknown;
  context?: unknown;
  line?: unknown;
};

export function formatEditPreview(
  doc: string,
  changes: EditChange[],
  maxLen = 48,
): string {
  if (
    changes.length === 1 &&
    changes[0].from === 0 &&
    changes[0].to === doc.length
  ) {
    const chars = changes[0].insert.length;
    return `全文替换（约 ${chars} 字）`;
  }

  const clip = (s: string) => (s.length > maxLen ? `${s.slice(0, maxLen)}…` : s);
  return changes
    .map((c, i) => {
      const oldText = doc.slice(c.from, c.to).replace(/\n/g, " ↵ ");
      const newText = c.insert.replace(/\n/g, " ↵ ");
      return `${i + 1}. 「${clip(oldText)}」→「${clip(newText)}」`;
    })
    .join("\n");
}

function formatInlineContext(context: AgentContextSnippet | null | undefined): string {
  if (!context?.text.trim()) return "";

  return [
    "用户手动添加的选区上下文：",
    `来源: ${context.documentPath ?? "当前未保存文档"}`,
    `范围: ${context.from}-${context.to}`,
    "",
    context.text.trim(),
  ].join("\n");
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return body.slice(start, end + 1);
  return body;
}

function parseProofreadItems(rawResponse: string): RawProofreadIssue[] {
  const parsed = JSON.parse(extractJsonPayload(rawResponse)) as unknown;
  if (!parsed || typeof parsed !== "object") return [];
  const issues = (parsed as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (issues as RawProofreadIssue[]) : [];
}

function allIndexesOf(text: string, search: string, from = 0): number[] {
  const indexes: number[] = [];
  if (!search) return indexes;

  let index = text.indexOf(search, from);
  while (index !== -1) {
    indexes.push(index);
    index = text.indexOf(search, index + Math.max(1, search.length));
  }
  return indexes;
}

function lineStartOffset(doc: string, lineNumber: number): number | null {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return null;
  if (lineNumber === 1) return 0;

  let line = 1;
  for (let i = 0; i < doc.length; i++) {
    if (doc.charCodeAt(i) !== 10) continue;
    line += 1;
    if (line === lineNumber) return i + 1;
  }
  return null;
}

function rangeOverlaps(from: number, to: number, occupied: Array<{ from: number; to: number }>) {
  return occupied.some((range) => from < range.to && to > range.from);
}

function findProofreadRange(
  doc: string,
  original: string,
  context: string | undefined,
  line: number | undefined,
  occupied: Array<{ from: number; to: number }>,
): { from: number; to: number } | null {
  const candidates: number[] = [];

  if (context) {
    for (const contextFrom of allIndexesOf(doc, context)) {
      const local = context.indexOf(original);
      if (local >= 0) candidates.push(contextFrom + local);
    }
  }

  if (line) {
    const lineFrom = lineStartOffset(doc, line);
    if (lineFrom !== null) {
      const lineEnd = doc.indexOf("\n", lineFrom);
      const lineText = doc.slice(lineFrom, lineEnd === -1 ? doc.length : lineEnd);
      const local = lineText.indexOf(original);
      if (local >= 0) candidates.push(lineFrom + local);
    }
  }

  candidates.push(...allIndexesOf(doc, original));

  for (const from of candidates) {
    const to = from + original.length;
    if (from < 0 || to > doc.length) continue;
    if (rangeOverlaps(from, to, occupied)) continue;
    return { from, to };
  }

  return null;
}

function proofreadIssueId(issue: Omit<ProofreadIssue, "id">, index: number) {
  return `proofread:${issue.from}:${issue.to}:${index}`;
}

function normalizeProofreadIssues(doc: string, rawResponse: string): ProofreadIssue[] {
  let rawIssues: RawProofreadIssue[] = [];
  try {
    rawIssues = parseProofreadItems(rawResponse);
  } catch {
    return [];
  }

  const issues: ProofreadIssue[] = [];
  const occupied: Array<{ from: number; to: number }> = [];

  rawIssues.forEach((item) => {
    const original = typeof item.original === "string" ? item.original.trim() : "";
    const suggestion = typeof item.suggestion === "string" ? item.suggestion.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    const context = typeof item.context === "string" ? item.context.trim() : undefined;
    const line = typeof item.line === "number" && Number.isFinite(item.line)
      ? Math.trunc(item.line)
      : undefined;

    if (!original || !suggestion || original === suggestion) return;

    const range = findProofreadRange(doc, original, context, line, occupied);
    if (!range) return;

    const issueWithoutId: Omit<ProofreadIssue, "id"> = {
      ...range,
      original,
      suggestion,
      reason: reason || "疑似错别字",
      context,
      line,
    };

    issues.push({
      id: proofreadIssueId(issueWithoutId, issues.length),
      ...issueWithoutId,
    });
    occupied.push(range);
  });

  return issues.sort((left, right) => left.from - right.from);
}

export function applyChangesToDoc(doc: string, changes: EditChange[]): string {
  let result = "";
  let lastIdx = 0;
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  for (const change of sorted) {
    result += doc.slice(lastIdx, change.from) + change.insert;
    lastIdx = change.to;
  }
  result += doc.slice(lastIdx);
  return result;
}

export function isFullDocChange(changes: EditChange[], originalDoc: string): boolean {
  return (
    changes.length === 1 &&
    changes[0].from === 0 &&
    changes[0].to === originalDoc.length
  );
}

export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  if (m * n > 1000000) {
    const result: DiffLine[] = [];
    for (const line of oldLines) {
      result.push({ type: "removed", text: line });
    }
    for (const line of newLines) {
      result.push({ type: "added", text: line });
    }
    return result;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "normal", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", text: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}

export function compressDiff(lines: DiffLine[], contextLines = 2): CompressedDiffLine[] {
  const result: CompressedDiffLine[] = [];
  const n = lines.length;

  const shouldShow = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (lines[i].type === "added" || lines[i].type === "removed") {
      shouldShow[i] = true;
      for (let j = 1; j <= contextLines; j++) {
        if (i - j >= 0) shouldShow[i - j] = true;
        if (i + j < n) shouldShow[i + j] = true;
      }
    }
  }

  let inEllipsis = false;
  for (let i = 0; i < n; i++) {
    if (shouldShow[i]) {
      inEllipsis = false;
      result.push({
        type: lines[i].type,
        text: lines[i].text,
      });
    } else {
      if (!inEllipsis) {
        let count = 0;
        for (let k = i; k < n; k++) {
          if (!shouldShow[k]) count++;
          else break;
        }
        result.push({
          type: "ellipsis",
          text: `... 省略 ${count} 行相同内容 ...`,
        });
        inEllipsis = true;
      }
    }
  }

  return result;
}

const HISTORY_KEY_PREFIX = "blank.ai-history:";
const ACTIVE_CONVERSATION_KEY_PREFIX = "blank.ai-active-conversation:";
const LEGACY_CONVERSATION_ID = "legacy";
const MAX_STORED_HISTORY_ITEMS = 50;
const HISTORY_STORAGE_BUDGET_CHARS = 2_000_000;
const MAX_STORED_RESPONSE_CHARS = 12_000;
const MAX_STORED_AGENT_ACTIVITIES = 40;
const MAX_STORED_ACTIVITY_DETAIL_CHARS = 1_000;

function historyStorageKey(documentKey: string) {
  return `${HISTORY_KEY_PREFIX}${documentKey}`;
}

function activeConversationStorageKey(documentKey: string) {
  return `${ACTIVE_CONVERSATION_KEY_PREFIX}${documentKey}`;
}

function createConversationId() {
  return Math.random().toString(36).slice(2, 11);
}

function createActiveConversations(): ActiveConversationMap {
  return {
    agent: createConversationId(),
    quick: createConversationId(),
  };
}

function truncateConversationTitle(text: string, max = 28) {
  const line = text.split("\n").map((part) => part.trim()).find((part) => part.length > 0) ?? "";
  if (!line) return "新对话";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function resolveConversationId(item: AIHistoryItem) {
  return item.conversationId?.trim() || LEGACY_CONVERSATION_ID;
}

export function resolveHistoryMode(item: AIHistoryItem): AIHistoryMode {
  if (item.mode === "agent" || item.mode === "quick" || item.mode === "proofread") {
    return item.mode;
  }
  return "agent";
}

export function isHistoryItemInThread(
  item: AIHistoryItem,
  mode: AIComposerMode,
  conversationId: string,
) {
  if (resolveConversationId(item) !== conversationId) return false;
  const itemMode = resolveHistoryMode(item);
  return itemMode === mode || itemMode === "proofread";
}

function normalizeHistoryConversationIds(items: AIHistoryItem[]) {
  return items.map((item) => ({
    ...item,
    conversationId: resolveConversationId(item),
  }));
}

function conversationIdsInHistory(items: AIHistoryItem[], mode: AIComposerMode) {
  return new Set(
    items
      .filter((item) => resolveHistoryMode(item) === mode)
      .map(resolveConversationId),
  );
}

function latestConversationId(items: AIHistoryItem[], mode: AIComposerMode) {
  let latestId: string | null = null;
  let latestTimestamp = 0;
  for (const item of items) {
    if (resolveHistoryMode(item) !== mode) continue;
    if (item.timestamp >= latestTimestamp) {
      latestTimestamp = item.timestamp;
      latestId = resolveConversationId(item);
    }
  }
  return latestId;
}

function otherComposerMode(mode: AIComposerMode): AIComposerMode {
  return mode === "agent" ? "quick" : "agent";
}

function pickActiveConversationId(
  stored: string | undefined,
  items: AIHistoryItem[],
  mode: AIComposerMode,
) {
  const ids = conversationIdsInHistory(items, mode);
  if (stored) {
    if (ids.has(stored)) return stored;
    if (ids.size === 0 && !conversationIdsInHistory(items, otherComposerMode(mode)).has(stored)) {
      return stored;
    }
  }
  return latestConversationId(items, mode) ?? createConversationId();
}

function parseStoredActiveConversations(raw: string | null): Partial<ActiveConversationMap> | string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return null;
      return {
        agent: typeof parsed.agent === "string" ? parsed.agent.trim() : undefined,
        quick: typeof parsed.quick === "string" ? parsed.quick.trim() : undefined,
      };
    } catch {
      return null;
    }
  }
  return trimmed;
}

function loadActiveConversations(documentKey: string, items: AIHistoryItem[]): ActiveConversationMap {
  let stored: Partial<ActiveConversationMap> | string | null = null;
  try {
    stored = parseStoredActiveConversations(
      localStorage.getItem(activeConversationStorageKey(documentKey)),
    );
  } catch {
    stored = null;
  }

  if (typeof stored === "string") {
    return {
      agent: pickActiveConversationId(stored, items, "agent"),
      quick: pickActiveConversationId(stored, items, "quick"),
    };
  }

  return {
    agent: pickActiveConversationId(stored?.agent, items, "agent"),
    quick: pickActiveConversationId(stored?.quick, items, "quick"),
  };
}

function saveActiveConversations(documentKey: string, conversations: ActiveConversationMap) {
  safeSetLocalStorageItem(
    activeConversationStorageKey(documentKey),
    JSON.stringify(conversations),
  );
}

function buildConversationSummaries(
  items: AIHistoryItem[],
  activeConversationId: string,
  mode: AIComposerMode,
): AIConversationSummary[] {
  const modeConversationIds = conversationIdsInHistory(items, mode);
  modeConversationIds.add(activeConversationId);
  const groups = new Map<string, AIConversationSummary>();

  for (const item of items) {
    const itemMode = resolveHistoryMode(item);
    const conversationId = resolveConversationId(item);
    const include =
      itemMode === mode ||
      (itemMode === "proofread" && modeConversationIds.has(conversationId));
    if (!include) continue;

    const existing = groups.get(conversationId);
    if (!existing) {
      groups.set(conversationId, {
        id: conversationId,
        title: truncateConversationTitle(item.instruction),
        updatedAt: item.timestamp,
        turnCount: 1,
      });
      continue;
    }

    existing.turnCount += 1;
    if (item.timestamp >= existing.updatedAt) {
      existing.updatedAt = item.timestamp;
      if (item.instruction.trim()) {
        existing.title = truncateConversationTitle(item.instruction);
      }
    }
  }

  if (!groups.has(activeConversationId)) {
    groups.set(activeConversationId, {
      id: activeConversationId,
      title: "新对话",
      updatedAt: Date.now(),
      turnCount: 0,
    });
  }

  return [...groups.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

function isPersistableHistoryItem(item: AIHistoryItem) {
  return item.status !== "loading";
}

function truncateText(text: string | undefined, max: number) {
  if (typeof text !== "string" || text.length <= max) return text;
  return `${text.slice(0, max)}\n\n... 已截断过长内容以节省本地存储空间`;
}

function newestHistoryItems(list: AIHistoryItem[], maxItems: number) {
  if (list.length <= maxItems) return list;
  const keepIds = new Set(
    [...list]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, maxItems)
      .map((item) => item.id),
  );
  return list.filter((item) => keepIds.has(item.id));
}

function compactHistoryItemForStorage(item: AIHistoryItem): AIHistoryItem {
  return {
    ...item,
    resultDoc: undefined,
    rawResponse: truncateText(item.rawResponse, MAX_STORED_RESPONSE_CHARS) ?? "",
    assistantText: truncateText(item.assistantText, MAX_STORED_RESPONSE_CHARS),
    agentActivities: item.agentActivities
      ?.slice(-MAX_STORED_AGENT_ACTIVITIES)
      .map((activity) => ({
        ...activity,
        detail: truncateText(activity.detail, MAX_STORED_ACTIVITY_DETAIL_CHARS),
      })),
  };
}

function trimHistoryForStorage(
  list: AIHistoryItem[],
  maxItems = MAX_STORED_HISTORY_ITEMS,
  budgetChars = HISTORY_STORAGE_BUDGET_CHARS,
) {
  let payload = newestHistoryItems(list, maxItems)
    .filter(isPersistableHistoryItem)
    .map(compactHistoryItemForStorage);

  while (payload.length > 1 && JSON.stringify(payload).length > budgetChars) {
    const oldest = payload.reduce(
      (oldestIndex, item, index) =>
        item.timestamp < payload[oldestIndex].timestamp ? index : oldestIndex,
      0,
    );
    payload = payload.filter((_, index) => index !== oldest);
  }

  return payload;
}

function normalizeStoredHistoryItem(value: unknown): AIHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<AIHistoryItem>;
  if (typeof item.id !== "string" || typeof item.timestamp !== "number") return null;
  if (typeof item.instruction !== "string" || typeof item.originalDoc !== "string") return null;
  if (typeof item.rawResponse !== "string" || !Array.isArray(item.changes)) return null;
  if (
    item.status !== "loading" &&
    item.status !== "done" &&
    item.status !== "no-changes" &&
    item.status !== "error" &&
    item.status !== "applied" &&
    item.status !== "discarded" &&
    item.status !== "cancelled" &&
    item.status !== "proofread"
  ) {
    return null;
  }

  const changes = item.changes.filter(
    (change): change is EditChange =>
      !!change &&
      typeof change === "object" &&
      typeof change.from === "number" &&
      typeof change.to === "number" &&
      typeof change.insert === "string",
  );

  return {
    id: item.id,
    timestamp: item.timestamp,
    instruction: item.instruction,
    status: item.status,
    errorMsg: typeof item.errorMsg === "string" ? item.errorMsg : undefined,
    noChangesHint: typeof item.noChangesHint === "string" ? item.noChangesHint : undefined,
    originalDoc: item.originalDoc,
    resultDoc: typeof item.resultDoc === "string" ? item.resultDoc : undefined,
    changes,
    proofreadIssues: Array.isArray(item.proofreadIssues)
      ? item.proofreadIssues.filter(
          (issue): issue is ProofreadIssue =>
            !!issue &&
            typeof issue === "object" &&
            typeof (issue as ProofreadIssue).id === "string" &&
            typeof (issue as ProofreadIssue).from === "number" &&
            typeof (issue as ProofreadIssue).to === "number" &&
            typeof (issue as ProofreadIssue).original === "string" &&
            typeof (issue as ProofreadIssue).suggestion === "string" &&
            typeof (issue as ProofreadIssue).reason === "string",
        )
          .map((issue) => ({
            ...issue,
            status:
              issue.status === "applied" || issue.status === "ignored"
                ? issue.status
                : "pending",
          }))
      : undefined,
    rawResponse: item.rawResponse,
    mode: item.mode === "agent" || item.mode === "quick" || item.mode === "proofread"
      ? item.mode
      : undefined,
    conversationId: typeof item.conversationId === "string" ? item.conversationId : undefined,
    assistantText: typeof item.assistantText === "string" ? item.assistantText : undefined,
    agentActivities: Array.isArray(item.agentActivities)
      ? item.agentActivities
          .filter(
            (a): a is AgentActivity =>
              !!a &&
              typeof a === "object" &&
              typeof (a as AgentActivity).id === "string" &&
              typeof (a as AgentActivity).tool === "string",
          )
          .map((activity) => ({
            ...activity,
            kind: activity.kind === "thinking" ? "thinking" : "tool",
            detail: typeof activity.detail === "string" ? activity.detail : undefined,
          }))
      : undefined,
  };
}

function loadHistoryList(documentKey: string): AIHistoryItem[] {
  try {
    const raw = localStorage.getItem(historyStorageKey(documentKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStoredHistoryItem)
      .filter((item): item is AIHistoryItem => item !== null && isPersistableHistoryItem(item));
  } catch {
    return [];
  }
}

function saveHistoryList(documentKey: string, list: AIHistoryItem[]) {
  safeSetLocalStorageJson(historyStorageKey(documentKey), trimHistoryForStorage(list), {
    onQuotaExceeded: (attempt) =>
      trimHistoryForStorage(
        list,
        Math.max(10, MAX_STORED_HISTORY_ITEMS - (attempt + 1) * 10),
        Math.max(500_000, HISTORY_STORAGE_BUDGET_CHARS - (attempt + 1) * 350_000),
      ),
  });
}

export function migrateAiHistoryKey(fromKey: string, toKey: string) {
  const from = fromKey.trim();
  const to = toKey.trim();
  if (!from || !to || from === to) return;

  const fromItems = loadHistoryList(from);
  if (fromItems.length === 0) {
    localStorage.removeItem(historyStorageKey(from));
    return;
  }

  const existing = loadHistoryList(to);
  saveHistoryList(to, [...fromItems, ...existing]);
  localStorage.removeItem(historyStorageKey(from));

  const activeConversationId = localStorage.getItem(activeConversationStorageKey(from));
  if (activeConversationId) {
    safeSetLocalStorageItem(activeConversationStorageKey(to), activeConversationId);
    localStorage.removeItem(activeConversationStorageKey(from));
  }
}

function formatAgentHistoryEditSummary(changes: EditChange[]): string {
  const excerpt = changes[0]?.insert.replace(/\s+/g, " ").trim();
  const preview =
    excerpt && excerpt.length > 240 ? `${excerpt.slice(0, 240)}...` : excerpt;

  return [
    "已提交文档修改预览:",
    `共 ${changes.length} 处`,
    preview ? `示例: ${preview}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildComposerHistoryFromItems(
  items: AIHistoryItem[],
  options: {
    excludeId?: string;
    conversationId?: string;
    mode: AIComposerMode;
  },
): AgentHistoryMessage[] {
  const messages: AgentHistoryMessage[] = [];

  for (const item of items) {
    if (item.id === options.excludeId) continue;
    if (options.conversationId && resolveConversationId(item) !== options.conversationId) continue;
    if (resolveHistoryMode(item) !== options.mode) continue;
    if (item.status === "loading" || item.status === "cancelled") continue;

    const instruction = item.instruction.trim();
    if (instruction) {
      messages.push({ role: "user", text: instruction });
    }

    const assistantParts: string[] = [];
    const assistantText = (item.assistantText ?? item.rawResponse).trim();
    if (assistantText) assistantParts.push(assistantText);
    if ((item.changes?.length ?? 0) > 0) {
      assistantParts.push(formatAgentHistoryEditSummary(item.changes));
    }

    const assistantContent = assistantParts.join("\n\n").trim();
    if (assistantContent) {
      messages.push({ role: "assistant", text: assistantContent });
    }
  }

  return messages;
}

export type { AgentActivity, AgentContextSnippet, AgentHistoryMessage } from "../agent/types";

export function summarizeItemDiff(item: AIHistoryItem) {
  if (item.changes.length === 0) {
    return { added: 0, removed: 0, changeCount: 0 };
  }

  const newDoc = applyChangesToDoc(item.originalDoc, item.changes);
  let added = 0;
  let removed = 0;

  for (const line of lineDiff(item.originalDoc, newDoc)) {
    if (line.type === "added") added += 1;
    if (line.type === "removed") removed += 1;
  }

  return { added, removed, changeCount: item.changes.length };
}

const settings = reactive(loadSettings());
watch(settings, (s) => saveSettings(s), { deep: true });

export function useAI(getDocumentKey: () => string = () => "__untitled__") {
  const historyList = ref<AIHistoryItem[]>(
    normalizeHistoryConversationIds(loadHistoryList(getDocumentKey())),
  );
  const activeConversations = ref<ActiveConversationMap>(
    loadActiveConversations(getDocumentKey(), historyList.value),
  );
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => getDocumentKey(),
    (documentKey) => {
      historyList.value = normalizeHistoryConversationIds(loadHistoryList(documentKey));
      activeConversations.value = loadActiveConversations(documentKey, historyList.value);
    },
  );

  watch(
    activeConversations,
    (conversations) => {
      saveActiveConversations(getDocumentKey(), conversations);
    },
    { deep: true },
  );

  watch(
    historyList,
    (list) => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        saveHistoryList(getDocumentKey(), list);
      }, 200);
    },
    { deep: true },
  );

  function getActiveConversationId(mode: AIComposerMode) {
    return activeConversations.value[mode];
  }

  function listConversationSummaries(mode: AIComposerMode) {
    return buildConversationSummaries(
      historyList.value,
      activeConversations.value[mode],
      mode,
    );
  }

  function startNewConversation(mode: AIComposerMode) {
    activeConversations.value = {
      ...activeConversations.value,
      [mode]: createConversationId(),
    };
  }

  function switchConversation(mode: AIComposerMode, conversationId: string) {
    if (!conversationId.trim()) return;
    activeConversations.value = {
      ...activeConversations.value,
      [mode]: conversationId,
    };
  }

  function clearConversations(mode?: AIComposerMode) {
    if (!mode) {
      historyList.value = [];
      activeConversations.value = createActiveConversations();
      return;
    }

    const ids = conversationIdsInHistory(historyList.value, mode);
    ids.add(activeConversations.value[mode]);
    historyList.value = historyList.value.filter((item) => {
      const itemMode = resolveHistoryMode(item);
      if (itemMode === mode) return false;
      if (itemMode === "proofread") return !ids.has(resolveConversationId(item));
      return true;
    });
    startNewConversation(mode);
  }

  async function streamEdit(
    instruction: string,
    doc: string,
    onChunk: (delta: string) => void,
    signal: AbortSignal,
    context?: AgentContextSnippet | null,
    history: AgentHistoryMessage[] = [],
  ): Promise<EditChange[]> {
    const result = streamText({
      model: createAgentLanguageModel(settings),
      system: CHAT_SYSTEM_PROMPT,
      messages: [
        ...buildAgentHistoryMessages(history),
        {
          role: "user",
          content: [
            doc.trim()
              ? `当前文档（只读参考，不是要修改的稿件）:\n---文档开始---\n${doc}\n---文档结束---`
              : "",
            formatInlineContext(context),
            `用户消息:\n${instruction}`,
          ].filter(Boolean).join("\n\n"),
        },
      ],
      abortSignal: signal,
      providerOptions: createReasoningProviderOptions(settings),
    });

    for await (const part of result.fullStream) {
      if (part.type === "abort") {
        throw new DOMException("Aborted", "AbortError");
      }
      if (part.type === "error") {
        throwUserFacingError(part.error);
      }
      if (part.type === "text-delta") {
        onChunk(part.text);
      }
    }
    throwIfAborted(signal);
    return [];
  }

  async function proofreadDocument(
    doc: string,
    signal: AbortSignal,
    onActivity?: (activity: AgentActivity) => void,
  ): Promise<ProofreadResult> {
    const result = streamText({
      model: createAgentLanguageModel(settings),
      system: PROOFREAD_SYSTEM_PROMPT,
      prompt: `---文档开始---\n${doc}\n---文档结束---\n\n请检查这篇 Markdown 文档中的明确错别字，并按指定 JSON 格式返回。`,
      temperature: 0,
      abortSignal: signal,
      providerOptions: createReasoningProviderOptions(settings),
    });
    const reasoning = new Map<string, AgentActivity>();
    let timelineSeq = 0;
    let rawResponse = "";
    const reasoningId = "proofread-thinking";

    const publish = (activity: AgentActivity) => {
      reasoning.set(activity.id, activity);
      onActivity?.({ ...activity });
    };

    if (selectedModelSupportsReasoning(settings)) {
      publish({
        id: reasoningId,
        kind: "thinking",
        tool: "thinking",
        status: "running",
        detail: "",
        contentOffset: 0,
        timelineSeq: ++timelineSeq,
      });
    }

    try {
      for await (const part of result.fullStream) {
        if (part.type === "abort") {
          throw new DOMException("Aborted", "AbortError");
        }
        if (part.type === "text-delta") {
          rawResponse += part.text;
          continue;
        }

        if (part.type === "reasoning-start") {
          if (!reasoning.has(reasoningId)) {
            publish({
              id: reasoningId,
              kind: "thinking",
              tool: "thinking",
              status: "running",
              detail: "",
              contentOffset: 0,
              timelineSeq: ++timelineSeq,
            });
          }
          continue;
        }

        if (part.type === "reasoning-delta") {
          const existing = reasoning.get(reasoningId);
          publish({
            id: reasoningId,
            kind: "thinking",
            tool: "thinking",
            status: "running",
            detail: `${existing?.detail ?? ""}${part.text}`,
            contentOffset: existing?.contentOffset ?? 0,
            timelineSeq: existing?.timelineSeq ?? ++timelineSeq,
          });
          continue;
        }

        if (part.type === "reasoning-end") {
          const existing = reasoning.get(reasoningId);
          if (existing) {
            publish({
              ...existing,
              status: "done",
              summary: existing.detail?.replace(/\s+/g, " ").trim().slice(0, 80),
            });
          }
        }
      }
    } finally {
      for (const activity of reasoning.values()) {
        if (activity.status === "running") publish({ ...activity, status: "done" });
      }
    }
    throwIfAborted(signal);

    rawResponse = rawResponse.trim();
    return {
      issues: normalizeProofreadIssues(doc, rawResponse),
      rawResponse,
    };
  }

  async function runAgent(
    instruction: string,
    doc: string,
    options: {
      documentPath: string | null;
      workspacePaths: string[];
      readWorkspaceFile: (path: string) => Promise<string>;
      history?: AgentHistoryMessage[];
      onTextDelta?: (text: string) => void;
      onActivity?: (activity: AgentActivity) => void;
      context?: AgentContextSnippet | null;
      signal: AbortSignal;
    },
  ) {
    if (!resolveAgentModel(settings)) {
      throw new Error("请先在设置中启用服务商并填写 API Key");
    }

    return runSheafAgent({
      prompt: instruction,
      history: options.history,
      contexts: options.context ? [options.context] : [],
      doc,
      documentPath: options.documentPath,
      workspacePaths: options.workspacePaths,
      readWorkspaceFile: options.readWorkspaceFile,
      providerSettings: settings,
      webSearch: {
        enabled: settings.webSearchEnabled,
        maxResults: settings.webSearchMaxResults,
      },
      signal: options.signal,
      onTextDelta: options.onTextDelta,
      onActivity: options.onActivity,
    });
  }

  return {
    settings,
    streamEdit,
    proofreadDocument,
    runAgent,
    historyList,
    getActiveConversationId,
    listConversationSummaries,
    startNewConversation,
    switchConversation,
    clearConversations,
  };
}
