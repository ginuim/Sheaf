import { reactive, watch, ref, computed } from "vue";
import { createAiFetch } from "../agent/ai-transport";
import { runSheafAgent } from "../agent/run-agent";
import type { AgentActivity, AgentContextSnippet, AgentHistoryMessage } from "../agent/types";
import { resolveAgentModel } from "../ai-providers/resolve";
import {
  loadAiSettings,
  saveAiSettings,
  type AiProviderSettings,
} from "../ai-providers/settings";
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

export type AIHistoryMode = "quick" | "agent";

export interface AIHistoryItem {
  id: string;
  timestamp: number;
  instruction: string;
  status: "loading" | "done" | "no-changes" | "error" | "applied" | "discarded" | "proofread";
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

const SYSTEM_PROMPT = `你是 Markdown 文档编辑助手。根据用户指令修改文档，只输出修改内容，不要解释、不要前言后记。
禁止用 \`\`\` 代码块包裹输出。

对于局部修改，必须使用 SEARCH/REPLACE 块（SEARCH 必须是文档里存在的连续原文，一字不差）：

<<<<<<< SEARCH
原文片段
=======
新文本
>>>>>>> REPLACE

若需替换全文或修改幅度极大，请不要使用 SEARCH/REPLACE 块，直接输出修改后的完整新文档。
若确实无需改动，只输出：NO_CHANGES`;

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

function cleanDocumentMarkers(text: string): string {
  let lines = text.split("\n");

  while (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (/^[-\u2014\u2013_*~\s]*(文档开始|DOCUMENT_START|START_OF_DOC)\s*[-\u2014\u2013_*~\s]*$/i.test(firstLine)) {
      lines.shift();
    } else {
      break;
    }
  }

  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    if (/^[-\u2014\u2013_*~\s]*(文档结束|DOCUMENT_END|END_OF_DOC)\s*[-\u2014\u2013_*~\s]*$/i.test(lastLine)) {
      lines.pop();
    } else {
      break;
    }
  }

  return lines.join("\n").trim();
}

function extractResponseBody(text: string): string {
  let body = text.replace(/\r\n/g, "\n").trim();
  if (!body || /\bNO_CHANGES\b/.test(body)) return "";

  // 严格剥离最外层包裹的 ```markdown、```md 或 ``` 包裹，不干扰正文内部的代码块
  const outerFenceMatch = body.match(/^```(?:markdown|md|text)?\n([\s\S]*?)\n```$/i);
  if (outerFenceMatch) {
    body = outerFenceMatch[1].trim();
  }

  return cleanDocumentMarkers(body);
}

function isDiffFormat(body: string): boolean {
  return body.includes("<<<<<<< SEARCH") || /\n=======\n/.test(body);
}

function parseBlocks(text: string): Array<{ search: string; replace: string }> {
  const body = extractResponseBody(text);
  if (!body) return [];

  const blocks: Array<{ search: string; replace: string }> = [];
  const separator = /\n=======\n/;

  if (body.includes("<<<<<<< SEARCH")) {
    const parts = body.split(/<<<<<<< SEARCH\n/);
    for (let i = 1; i < parts.length; i++) {
      const chunk = parts[i];
      const sep = chunk.search(separator);
      if (sep === -1) continue;
      const afterSep = sep + chunk.slice(sep).match(separator)![0].length;
      const endIdx = chunk.indexOf("\n>>>>>>> REPLACE", afterSep);
      const search = chunk.slice(0, sep);
      const replace = endIdx === -1 ? chunk.slice(afterSep) : chunk.slice(afterSep, endIdx);
      if (search.length > 0) blocks.push({ search, replace });
    }
    if (blocks.length > 0) return blocks;
  }

  const segments = body.split(separator);
  if (segments.length < 2) return blocks;

  for (let i = 0; i < segments.length - 1; i += 2) {
    const search = segments[i].replace(/^<<<<<<< SEARCH\n?/, "").replace(/\n$/, "");
    const replace = segments[i + 1]
      .replace(/\n>>>>>>> REPLACE$/, "")
      .replace(/^>>>>>>> REPLACE\n?/, "")
      .trim();
    if (search.length > 0) blocks.push({ search, replace });
  }

  return blocks;
}

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

function findSearchInDoc(doc: string, search: string): { index: number; length: number } | null {
  const candidates = [search, search.replace(/\r\n/g, "\n"), search.trimEnd(), search.trim()];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const idx = doc.indexOf(candidate);
    if (idx !== -1) return { index: idx, length: candidate.length };
  }
  return null;
}

function blocksToChanges(doc: string, blocks: Array<{ search: string; replace: string }>): EditChange[] {
  const changes: EditChange[] = [];
  for (const block of blocks) {
    const found = findSearchInDoc(doc, block.search);
    if (!found) continue;
    changes.push({
      from: found.index,
      to: found.index + found.length,
      insert: block.replace,
    });
  }
  changes.sort((a, b) => a.from - b.from);
  return changes;
}

function fullDocumentChange(doc: string, body: string): EditChange[] {
  if (!body || isDiffFormat(body)) return [];
  if (body.trimEnd() === doc.trimEnd()) return [];
  const insert = doc.endsWith("\n") && !body.endsWith("\n") ? `${body}\n` : body;
  return [{ from: 0, to: doc.length, insert }];
}

function resolveChanges(doc: string, accumulated: string): EditChange[] {
  if (/\bNO_CHANGES\b/.test(accumulated)) return [];

  const blockChanges = blocksToChanges(doc, parseBlocks(accumulated));
  if (blockChanges.length > 0) return blockChanges;

  return fullDocumentChange(doc, extractResponseBody(accumulated));
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

export function explainNoChanges(doc: string, accumulated: string): string {
  const body = extractResponseBody(accumulated);
  if (!body.trim()) return "AI 未返回可解析的内容，请重试";
  if (body.trimEnd() === doc.trimEnd()) return "AI 返回的正文与原文相同";
  if (parseBlocks(accumulated).length > 0) {
    return "未能匹配原文片段，请重试或改用更具体的修改描述";
  }
  return "无法解析 AI 返回格式，请重试";
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

function historyStorageKey(documentKey: string) {
  return `${HISTORY_KEY_PREFIX}${documentKey}`;
}

function activeConversationStorageKey(documentKey: string) {
  return `${ACTIVE_CONVERSATION_KEY_PREFIX}${documentKey}`;
}

function createConversationId() {
  return Math.random().toString(36).slice(2, 11);
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

function normalizeHistoryConversationIds(items: AIHistoryItem[]) {
  return items.map((item) => ({
    ...item,
    conversationId: resolveConversationId(item),
  }));
}

function conversationIdsInHistory(items: AIHistoryItem[]) {
  return new Set(items.map(resolveConversationId));
}

function latestConversationId(items: AIHistoryItem[]) {
  const latestByConversation = new Map<string, number>();
  for (const item of items) {
    const conversationId = resolveConversationId(item);
    const current = latestByConversation.get(conversationId) ?? 0;
    if (item.timestamp >= current) {
      latestByConversation.set(conversationId, item.timestamp);
    }
  }

  let latestId = LEGACY_CONVERSATION_ID;
  let latestTimestamp = 0;
  for (const [conversationId, timestamp] of latestByConversation) {
    if (timestamp >= latestTimestamp) {
      latestTimestamp = timestamp;
      latestId = conversationId;
    }
  }
  return latestId;
}

function loadActiveConversationId(documentKey: string, items: AIHistoryItem[]) {
  try {
    const stored = localStorage.getItem(activeConversationStorageKey(documentKey))?.trim();
    if (stored) {
      if (items.length === 0 || conversationIdsInHistory(items).has(stored)) {
        return stored;
      }
    }
  } catch {
    // ignore invalid storage
  }

  if (items.length === 0) return createConversationId();
  return latestConversationId(items);
}

function saveActiveConversationId(documentKey: string, conversationId: string) {
  localStorage.setItem(activeConversationStorageKey(documentKey), conversationId);
}

function buildConversationSummaries(
  items: AIHistoryItem[],
  activeConversationId: string,
): AIConversationSummary[] {
  const groups = new Map<string, AIConversationSummary>();

  for (const item of items) {
    const conversationId = resolveConversationId(item);
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
    mode: item.mode === "agent" || item.mode === "quick" ? item.mode : undefined,
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
  const payload = list.filter(isPersistableHistoryItem);
  localStorage.setItem(historyStorageKey(documentKey), JSON.stringify(payload));
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
    localStorage.setItem(activeConversationStorageKey(to), activeConversationId);
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

export function buildAgentHistoryFromItems(
  items: AIHistoryItem[],
  excludeId?: string,
  conversationId?: string,
): AgentHistoryMessage[] {
  const messages: AgentHistoryMessage[] = [];

  for (const item of items) {
    if (item.id === excludeId) continue;
    if (conversationId && resolveConversationId(item) !== conversationId) continue;
    if (item.mode !== "agent") continue;
    if (item.status === "loading") continue;

    const instruction = item.instruction.trim();
    if (instruction) {
      messages.push({ role: "user", text: instruction });
    }

    const assistantParts: string[] = [];
    const assistantText = (item.assistantText ?? item.rawResponse).trim();
    if (assistantText) assistantParts.push(assistantText);
    if (item.changes.length > 0) {
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
  const activeConversationId = ref(
    loadActiveConversationId(getDocumentKey(), historyList.value),
  );
  const conversationSummaries = computed(() =>
    buildConversationSummaries(historyList.value, activeConversationId.value),
  );
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => getDocumentKey(),
    (documentKey) => {
      historyList.value = normalizeHistoryConversationIds(loadHistoryList(documentKey));
      activeConversationId.value = loadActiveConversationId(documentKey, historyList.value);
    },
  );

  watch(activeConversationId, (conversationId) => {
    saveActiveConversationId(getDocumentKey(), conversationId);
  });

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

  function startNewConversation() {
    activeConversationId.value = createConversationId();
  }

  function switchConversation(conversationId: string) {
    if (!conversationId.trim()) return;
    activeConversationId.value = conversationId;
  }

  function clearAllConversations() {
    historyList.value = [];
    activeConversationId.value = createConversationId();
  }

  async function streamEdit(
    instruction: string,
    doc: string,
    onChunk: (delta: string) => void,
    signal: AbortSignal,
    context?: AgentContextSnippet | null,
  ): Promise<EditChange[]> {
    const resolved = resolveAgentModel(settings);
    if (!resolved) throw new Error("请先在设置中启用服务商并填写 API Key");

    const url = `${resolved.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await createAiFetch()(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `---文档开始---\n${doc}\n---文档结束---`,
              formatInlineContext(context),
              `修改指令: ${instruction}`,
            ].filter(Boolean).join("\n\n"),
          },
        ],
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API 错误 ${res.status}: ${errText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            onChunk(delta);
          }
        } catch {
          // 忽略不完整的 JSON chunk
        }
      }
    }

    return resolveChanges(doc, accumulated);
  }

  async function proofreadDocument(
    doc: string,
    signal: AbortSignal,
  ): Promise<ProofreadResult> {
    const resolved = resolveAgentModel(settings);
    if (!resolved) throw new Error("请先在设置中启用服务商并填写 API Key");

    const url = `${resolved.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await createAiFetch()(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.model,
        temperature: 0,
        messages: [
          { role: "system", content: PROOFREAD_SYSTEM_PROMPT },
          {
            role: "user",
            content: `---文档开始---\n${doc}\n---文档结束---\n\n请检查这篇 Markdown 文档中的明确错别字，并按指定 JSON 格式返回。`,
          },
        ],
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API 错误 ${res.status}: ${errText}`);
    }

    const payload = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawResponse = payload.choices?.[0]?.message?.content?.trim() ?? "";
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
    activeConversationId,
    conversationSummaries,
    startNewConversation,
    switchConversation,
    clearAllConversations,
  };
}
