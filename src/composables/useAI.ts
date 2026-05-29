import { reactive, watch, ref } from "vue";

const SETTINGS_KEY = "blank.ai-settings";

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

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

export interface AIHistoryItem {
  id: string;
  timestamp: number;
  instruction: string;
  status: "loading" | "done" | "no-changes" | "error" | "applied" | "discarded";
  errorMsg?: string;
  noChangesHint?: string;
  originalDoc: string;
  changes: EditChange[];
  rawResponse: string;
}

const DEFAULT_SETTINGS: AISettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
};

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: AISettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
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

const historyList = ref<AIHistoryItem[]>([]);

export function useAI() {
  const settings = reactive(loadSettings());

  watch(settings, (s) => saveSettings(s), { deep: true });

  async function streamEdit(
    instruction: string,
    doc: string,
    onChunk: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<EditChange[]> {
    if (!settings.apiKey) throw new Error("请先在设置中填写 API Key");

    const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `---文档开始---\n${doc}\n---文档结束---\n\n修改指令: ${instruction}`,
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

  return { settings, streamEdit, historyList };
}
