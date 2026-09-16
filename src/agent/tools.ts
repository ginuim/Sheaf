import { tool } from "ai";
import { z } from "zod";
import { extractReadableTextFromHtml } from "./extract-web";
import { fetchWebResource, resolveWebFetchMode } from "./web-transport";
import { formatWebSearchForAgent, runWebSearch } from "./web-search";
import { generateImageFromConfig } from "./image-generation";
import { saveGeneratedImageAsset } from "./save-generated-image";
import {
  applyUniqueReplace,
  defaultReadLineLimit,
  findOccurrences,
  formatGrepContent,
  grepLines,
  readLines,
} from "./text-ops";
import type { AgentToolRuntime, WorkspaceNote } from "./types";
import { validateEditChanges } from "./validate-edits";

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function buildWorkspaceNotes(
  workspacePaths: string[],
  documentPath: string | null,
): WorkspaceNote[] {
  const seen = new Set<string>();
  const notes: WorkspaceNote[] = [];

  const ordered = [
    ...(documentPath ? [documentPath] : []),
    ...workspacePaths,
  ];

  for (const path of ordered) {
    const normalized = path.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    notes.push({
      path: normalized,
      name: fileNameFromPath(normalized),
      isCurrent: documentPath === normalized,
    });
  }

  return notes.slice(0, 30);
}

function resolveNote(runtime: AgentToolRuntime, path: string): WorkspaceNote | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  return (
    runtime.workspaceNotes.find(
      (note) => note.path === trimmed || note.name === trimmed,
    ) ?? null
  );
}

function isCurrentPath(runtime: AgentToolRuntime, path?: string): boolean {
  const trimmed = path?.trim();
  if (!trimmed) return true;
  if (runtime.documentPath && (trimmed === runtime.documentPath || trimmed === fileNameFromPath(runtime.documentPath))) {
    return true;
  }
  return trimmed === "current" || trimmed === ".";
}

async function loadReadableText(
  runtime: AgentToolRuntime,
  path?: string,
): Promise<{ pathLabel: string; text: string; isCurrent: boolean } | { error: string }> {
  if (isCurrentPath(runtime, path)) {
    return {
      pathLabel: runtime.documentPath ?? "当前文档",
      text: runtime.getDoc(),
      isCurrent: true,
    };
  }

  const note = resolveNote(runtime, path ?? "");
  if (!note) {
    return {
      error: "该路径不在可访问列表中。请先调用 list_notes，并使用返回的 path。",
    };
  }
  if (note.isCurrent) {
    return {
      pathLabel: note.path,
      text: runtime.getDoc(),
      isCurrent: true,
    };
  }

  try {
    const text = await runtime.readWorkspaceFile(note.path);
    return { pathLabel: note.path, text, isCurrent: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败";
    return { error: message };
  }
}

function applyWorkingDoc(runtime: AgentToolRuntime, next: string) {
  if (next === runtime.originalDoc) {
    runtime.setDoc(next);
    runtime.pendingChanges = null;
    return { ok: true as const, changeCount: 0 };
  }

  const validated = validateEditChanges(runtime.originalDoc, [
    { from: 0, to: runtime.originalDoc.length, insert: next },
  ]);
  if (!validated.ok) return validated;

  runtime.setDoc(next);
  runtime.pendingChanges = validated.changes;
  return { ok: true as const, changeCount: 1 };
}

function applyOriginalHunks(
  runtime: AgentToolRuntime,
  next: string,
  hunks: Array<{ from: number; to: number; insert: string }>,
) {
  const validated = validateEditChanges(runtime.originalDoc, hunks);
  if (!validated.ok) return validated;
  runtime.setDoc(next);
  runtime.pendingChanges = validated.changes;
  return { ok: true as const, changeCount: validated.changes.length };
}

export function createSheafAgentTools(runtime: AgentToolRuntime) {
  const tools = {
    list_notes: tool({
      description:
        "列出当前可访问的 Markdown 笔记（当前文档 + 最近打开的文件）。read / grep 的 path 必须来自这里。",
      inputSchema: z.object({}),
      execute: async () => {
        if (runtime.workspaceNotes.length === 0) {
          return { notes: [], summary: "暂无其他可访问笔记", content: "暂无其他可访问笔记" };
        }
        return {
          notes: runtime.workspaceNotes.map((note) => ({
            path: note.path,
            name: note.name,
            current: note.isCurrent,
          })),
          summary: `${runtime.workspaceNotes.length} 篇笔记`,
        };
      },
    }),

    grep: tool({
      description:
        "在当前文档或白名单笔记中按行搜索。默认按字面量匹配；需要正则时设 regex=true。返回行号，随后用 read 或 edit。",
      inputSchema: z.object({
        pattern: z.string().min(1).describe("搜索词，默认按字面量匹配"),
        path: z.string().optional().describe("省略则搜索当前文档；其他文件须来自 list_notes"),
        regex: z.boolean().optional().describe("为 true 时按正则搜索"),
        caseInsensitive: z.boolean().optional(),
      }),
      execute: async ({ pattern, path, regex, caseInsensitive }) => {
        const loaded = await loadReadableText(runtime, path);
        if ("error" in loaded) return { ok: false, error: loaded.error };

        const result = grepLines(loaded.text, pattern, { regex, caseInsensitive });
        if (!result.ok) return result;

        const content = formatGrepContent(loaded.pathLabel, result.matches);
        return {
          ok: true,
          path: loaded.pathLabel,
          matchCount: result.matchCount,
          truncated: result.truncated,
          matches: result.matches,
          content: result.truncated
            ? `${content}\n\n[已截断，共 ${result.matchCount} 处匹配]`
            : content,
          summary:
            result.matchCount === 0
              ? `${loaded.pathLabel}: 无匹配`
              : `${loaded.pathLabel}: ${result.matchCount} 处匹配`,
        };
      },
    }),

    read: tool({
      description:
        "按行读取当前文档或白名单笔记。offset 为起始行号（从 1 计），limit 为行数，默认最多 400 行。长文用 grep 定位后再读。",
      inputSchema: z.object({
        path: z.string().optional().describe("省略则读取当前文档；其他文件须来自 list_notes"),
        offset: z.number().int().min(1).optional().describe("起始行号，从 1 计"),
        limit: z.number().int().min(1).max(2_000).optional().describe("读取行数"),
      }),
      execute: async ({ path, offset = 1, limit = defaultReadLineLimit }) => {
        const loaded = await loadReadableText(runtime, path);
        if ("error" in loaded) return { ok: false, error: loaded.error };

        const slice = readLines(loaded.text, offset, limit);
        const header = [
          `文件: ${loaded.pathLabel}`,
          `行: ${slice.startLine}-${slice.endLine} / 共 ${slice.totalLines} 行`,
          slice.truncated ? `状态: 已截断，下次 offset=${slice.endLine + 1}` : "状态: 完整",
          "",
        ].join("\n");

        return {
          ok: true,
          path: loaded.pathLabel,
          startLine: slice.startLine,
          endLine: slice.endLine,
          totalLines: slice.totalLines,
          truncated: slice.truncated,
          content: `${header}${slice.content}`,
          summary: slice.truncated
            ? `已读 ${slice.startLine}-${slice.endLine} 行 / 共 ${slice.totalLines}`
            : `已读 ${loaded.pathLabel} · ${slice.totalLines} 行`,
        };
      },
    }),

    edit: tool({
      description:
        "用一段与当前文档完全一致的原文 old_string 替换为 new_string，生成编辑器 diff 预览。old_string 必须唯一，除非 replace_all=true。只能改当前文档。插入内容时把插入点前后的唯一原文一并放入 old_string。",
      inputSchema: z.object({
        old_string: z.string().min(1).describe("文档中的原文，须完全一致"),
        new_string: z.string().describe("替换后的文本"),
        replace_all: z.boolean().optional().describe("替换所有匹配；默认只替换唯一的一处"),
      }),
      execute: async ({ old_string, new_string, replace_all }) => {
        const current = runtime.getDoc();
        const replaced = applyUniqueReplace(
          current,
          old_string,
          new_string,
          Boolean(replace_all),
        );
        if (!replaced.ok) return replaced;

        const indexes = findOccurrences(current, old_string);
        const hunks = (replace_all ? indexes : indexes.slice(0, 1)).map((from) => ({
          from,
          to: from + old_string.length,
          insert: new_string,
        }));

        const applied =
          current === runtime.originalDoc
            ? applyOriginalHunks(runtime, replaced.next, hunks)
            : applyWorkingDoc(runtime, replaced.next);
        if (!applied.ok) return applied;

        return {
          ok: true,
          count: replaced.count,
          changeCount: applied.changeCount,
          summary:
            replaced.count > 1
              ? `已替换 ${replaced.count} 处`
              : "已准备替换，可在编辑器预览",
        };
      },
    }),

    write: tool({
      description:
        "用完整 Markdown 覆盖当前文档，生成 diff 预览。仅用于空文档、全文重写，或 edit 无法表达的大段改写。不要用来做局部修改。",
      inputSchema: z.object({
        content: z.string().describe("完整 Markdown 正文"),
      }),
      execute: async ({ content }) => {
        if (content === runtime.getDoc()) {
          return { ok: false, error: "内容与当前文档相同" };
        }

        const applied = applyWorkingDoc(runtime, content);
        if (!applied.ok) return applied;

        return {
          ok: true,
          changeCount: applied.changeCount,
          summary: "已准备全文覆盖，可在编辑器预览",
        };
      },
    }),

    fetch_url: tool({
      description:
        "抓取指定 http/https 链接并提取正文。桌面版经安全网关；浏览器模式受跨域限制，失败时请改用 web_search。",
      inputSchema: z.object({
        url: z.string().url("链接格式无效"),
      }),
      execute: async ({ url }) => {
        try {
          const mode = await resolveWebFetchMode();
          const response = await fetchWebResource({ url });
          const content = extractReadableTextFromHtml(response.body, response.finalUrl);
          return { url: response.finalUrl, status: response.status, mode, content };
        } catch (error) {
          const message = error instanceof Error ? error.message : "抓取失败";
          return { ok: false, error: message };
        }
      },
    }),

    ...(runtime.imageModel
      ? {
          generate_image: tool({
            description:
              "根据文字描述生成图片。返回可插入文档的 Markdown 图片语法；写入文档时再用 edit 插入。",
            inputSchema: z.object({
              prompt: z.string().min(1).describe("图片描述"),
              alt: z.string().optional().describe("图片 alt 文本"),
              aspectRatio: z
                .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
                .optional()
                .describe("宽高比，默认 1:1"),
            }),
            execute: async ({ prompt, alt, aspectRatio }) => {
              try {
                const generated = await generateImageFromConfig(runtime.imageModel!, prompt, {
                  aspectRatio,
                });
                const saved = await saveGeneratedImageAsset(
                  runtime.documentPath,
                  generated,
                  alt?.trim() || "生成的图片",
                );
                return {
                  ok: true,
                  model: runtime.imageModel!.model,
                  markdown: saved.markdown,
                  src: saved.src,
                  savedPath: saved.savedPath,
                  summary: "图片已生成，请用 edit 插入文档",
                };
              } catch (error) {
                const message = error instanceof Error ? error.message : "生图失败";
                return { ok: false, error: message };
              }
            },
          }),
        }
      : {}),

    ...(runtime.webSearch.enabled
      ? {
          web_search: tool({
            description:
              "搜索互联网获取最新信息（无需 API Key，优先 Bing RSS）。返回带编号的来源与正文/摘要。若摘要不足以回答问题，应对最相关链接继续调用 fetch_url。",
            inputSchema: z.object({
              query: z.string().min(1),
            }),
            execute: async ({ query }) => {
              try {
                const response = await runWebSearch(query, {
                  maxResults: runtime.webSearch.maxResults,
                });
                const text = formatWebSearchForAgent(response);
                return {
                  query: response.query,
                  provider: response.provider,
                  mode: response.mode,
                  count: response.results.length,
                  content: text,
                };
              } catch (error) {
                const message = error instanceof Error ? error.message : "搜索失败";
                return { ok: false, error: message };
              }
            },
          }),
        }
      : {}),
  };

  return tools;
}
