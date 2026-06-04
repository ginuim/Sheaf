import { tool } from "ai";
import { z } from "zod";
import { buildAppendChange, findInsertPointAfterHeading } from "./edit-helpers";
import { buildEditorContextText } from "./context";
import { extractReadableTextFromHtml } from "./extract-web";
import { fetchWebResource, resolveWebFetchMode } from "./web-transport";
import { formatWebSearchForAgent, runWebSearch } from "./web-search";
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
  return (
    runtime.workspaceNotes.find(
      (note) => note.path === trimmed || note.name === trimmed,
    ) ?? null
  );
}

export function createSheafAgentTools(runtime: AgentToolRuntime) {
  const tools = {
    get_context: tool({
      description:
        "获取当前 Markdown 文档的路径、标题大纲与正文（可能截断）。用户消息通常已附带正文；仅在正文被截断或需确认最新内容时调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const text = buildEditorContextText(runtime.getDoc(), runtime.documentPath);
        return { content: text };
      },
    }),

    append_content: tool({
      description:
        "向文档追加 Markdown，或在指定标题章节末尾插入。适合新增段落/章节；比 propose_edits 更适合补充内容。",
      inputSchema: z.object({
        content: z.string().min(1),
        afterHeading: z
          .string()
          .optional()
          .describe("可选：在该标题章节末尾插入；省略则追加到文档末尾"),
        summary: z.string().optional(),
      }),
      execute: async ({ content, afterHeading, summary }) => {
        const doc = runtime.getDoc();
        const insertAt = afterHeading?.trim()
          ? findInsertPointAfterHeading(doc, afterHeading)
          : null;
        const change = buildAppendChange(
          doc,
          content,
          insertAt ?? undefined,
        );
        const validated = validateEditChanges(doc, [change]);
        if (!validated.ok) {
          return { ok: false, error: validated.error };
        }

        runtime.pendingChanges = validated.changes;

        return {
          ok: true,
          changeCount: 1,
          insertedAt: insertAt ?? doc.length,
          headingMatched: afterHeading?.trim() ? insertAt !== null : undefined,
          summary:
            summary ??
            "已记录追加内容，请告知用户可在面板中预览并应用。",
        };
      },
    }),

    propose_edits: tool({
      description:
        "提交对当前文档的修改。使用 CodeMirror 偏移：from/to 为原文区间 [from,to)，insert 为替换文本。可多处修改，区间不得重叠。",
      inputSchema: z.object({
        changes: z
          .array(
            z.object({
              from: z.number().int().min(0),
              to: z.number().int().min(0),
              insert: z.string(),
            }),
          )
          .min(1),
        summary: z.string().optional(),
      }),
      execute: async ({ changes, summary }) => {
        const doc = runtime.getDoc();
        const validated = validateEditChanges(doc, changes);
        if (!validated.ok) {
          return { ok: false, error: validated.error };
        }

        runtime.pendingChanges = validated.changes;

        return {
          ok: true,
          changeCount: validated.changes.length,
          summary: summary ?? `已记录 ${validated.changes.length} 处修改，请告知用户可在面板中预览并应用。`,
        };
      },
    }),

    fetch_url: tool({
      description:
        "抓取指定 http/https 链接并提取正文。桌面版经安全网关；浏览器模式受跨域限制，失败时请改用 web_search。",
      inputSchema: z.object({
        url: z.string().url(),
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

    list_notes: tool({
      description: "列出当前可访问的 Markdown 笔记路径（最近打开 + 当前文件）。",
      inputSchema: z.object({}),
      execute: async () => {
        if (runtime.workspaceNotes.length === 0) {
          return { notes: [], message: "暂无其他可访问笔记" };
        }
        return {
          notes: runtime.workspaceNotes.map((note) => ({
            path: note.path,
            name: note.name,
            current: note.isCurrent,
          })),
        };
      },
    }),

    read_note: tool({
      description:
        "读取白名单内的一篇 Markdown 笔记全文（路径须来自 list_notes）。",
      inputSchema: z.object({
        path: z.string().min(1),
      }),
      execute: async ({ path }) => {
        const note = resolveNote(runtime, path);
        if (!note) {
          return {
            ok: false,
            error: "该路径不在可访问列表中，请先调用 list_notes 并使用返回的 path。",
          };
        }

        try {
          const content = await runtime.readWorkspaceFile(note.path);
          const maxChars = 20_000;
          const truncated = content.length > maxChars;
          return {
            path: note.path,
            name: note.name,
            truncated,
            content: truncated ? `${content.slice(0, maxChars)}\n\n[已截断]` : content,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "读取失败";
          return { ok: false, error: message };
        }
      },
    }),

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
