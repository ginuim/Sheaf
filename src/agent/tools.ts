import { tool } from "ai";
import { z } from "zod";
import { buildAppendChange, findInsertPointAfterHeading } from "./edit-helpers";
import { buildEditorContextText } from "./context";
import {
  buildDocumentAnchors,
  findAnchor,
  findExactTextRange,
  findSectionByHeading,
  formatAnchorList,
  locateAnchors,
  normalizeInsertedContent,
  summarizeText,
  type DocumentAnchor,
  type DocumentAnchorKind,
} from "./document-structure";
import { extractReadableTextFromHtml } from "./extract-web";
import { fetchWebResource, resolveWebFetchMode } from "./web-transport";
import { formatWebSearchForAgent, runWebSearch } from "./web-search";
import { generateImageFromConfig } from "./image-generation";
import { saveGeneratedImageAsset } from "./save-generated-image";
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

const anchorKindSchema = z.enum([
  "block",
  "document",
  "document_end",
  "heading",
  "section",
  "table",
]);

function anchorSummary(anchor: DocumentAnchor) {
  return {
    id: anchor.id,
    kind: anchor.kind,
    from: anchor.from,
    to: anchor.to,
    title: anchor.title,
    level: anchor.level,
    excerpt: summarizeText(anchor.text ?? "", 160),
  };
}

function resolveReplaceRange(
  doc: string,
  input: {
    anchorId?: string;
    exactText?: string;
    from?: number;
    headingTitle?: string;
    targetKind?: DocumentAnchorKind | "exact_text" | "range";
    to?: number;
  },
): { from: number; to: number; original: string; target?: DocumentAnchor } | { error: string } {
  if (input.targetKind === "range" || (typeof input.from === "number" && typeof input.to === "number")) {
    const from = input.from ?? 0;
    const to = input.to ?? doc.length;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return { error: "from/to 必须是整数" };
    if (from < 0 || to < 0 || from > doc.length || to > doc.length) {
      return { error: `修改范围越界（文档长度 ${doc.length}）` };
    }
    if (from > to) return { error: "from 不能大于 to" };
    return { from, to, original: doc.slice(from, to) };
  }

  if (input.targetKind === "document") {
    const anchor = findAnchor(doc, "whole-document");
    return {
      from: 0,
      to: doc.length,
      original: doc,
      target: anchor ?? undefined,
    };
  }

  if (input.exactText?.trim()) {
    const exact = findExactTextRange(doc, input.exactText);
    if (!exact) return { error: "未在文档中找到 exactText 对应的连续原文" };
    return exact;
  }

  const anchor = input.anchorId?.trim()
    ? findAnchor(doc, input.anchorId)
    : input.headingTitle?.trim()
      ? findSectionByHeading(doc, input.headingTitle)
      : null;

  if (!anchor) {
    return { error: "未找到可替换目标，请先调用 inspect_document_structure 或 locate_content 获取 anchorId" };
  }
  if (anchor.kind === "document_end") {
    return { error: "document-end 不能用于替换，请使用 insert_content 插入内容" };
  }
  if (input.targetKind && input.targetKind !== "exact_text" && anchor.kind !== input.targetKind) {
    return { error: `anchor 类型是 ${anchor.kind}，不是 ${input.targetKind}` };
  }

  return {
    from: anchor.from,
    to: anchor.to,
    original: doc.slice(anchor.from, anchor.to),
    target: anchor,
  };
}

function resolveInsertPosition(
  doc: string,
  input: {
    anchorId?: string;
    headingTitle?: string;
    placement?: "after_anchor" | "after_heading" | "before_anchor" | "before_heading" | "document_end";
  },
): { position: number; target?: DocumentAnchor; headingMatched?: boolean } | { error: string } {
  const placement = input.placement ?? "document_end";
  if (placement === "document_end" && !input.anchorId && !input.headingTitle) {
    return { position: doc.length };
  }

  const target = input.anchorId?.trim()
    ? findAnchor(doc, input.anchorId)
    : input.headingTitle?.trim()
      ? findSectionByHeading(doc, input.headingTitle)
      : null;

  if (!target) {
    return { error: "未找到插入位置，请先调用 inspect_document_structure 或 locate_content 获取 anchorId" };
  }

  if (placement === "before_anchor" || placement === "before_heading") {
    return { position: target.from, target, headingMatched: Boolean(input.headingTitle?.trim()) };
  }

  return { position: target.to, target, headingMatched: Boolean(input.headingTitle?.trim()) };
}

function validateAndStoreChanges(
  runtime: AgentToolRuntime,
  changes: Array<{ from: number; to: number; insert: string }>,
  summary: string,
) {
  const doc = runtime.getDoc();
  const validated = validateEditChanges(doc, changes);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  runtime.pendingChanges = validated.changes;
  return {
    ok: true,
    changeCount: validated.changes.length,
    summary,
  };
}

function validateMarkdownStructure(content: string) {
  const issues: Array<{ line: number; message: string; type: string }> = [];
  const lines = content.split("\n");
  const headings = new Map<string, number>();

  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
    if (!match) return;
    const title = match[2].trim();
    const key = title.toLowerCase();
    const previousLine = headings.get(key);
    if (previousLine !== undefined) {
      issues.push({
        line: index + 1,
        message: `标题「${title}」与第 ${previousLine} 行重复`,
        type: "duplicate_heading",
      });
      return;
    }
    headings.set(key, index + 1);
  });

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.includes("|")) continue;
    const expected = splitTableCells(line).length;
    if (expected < 2) continue;

    let row = index + 1;
    while (row < lines.length && lines[row].trim().includes("|")) {
      const count = splitTableCells(lines[row].trim()).length;
      if (count >= 2 && count !== expected) {
        issues.push({
          line: row + 1,
          message: `Markdown 表格列数不一致：期望 ${expected} 列，实际 ${count} 列`,
          type: "malformed_table",
        });
        break;
      }
      row += 1;
    }
    index = Math.max(index, row - 1);
  }

  if (content.startsWith("---") && content.indexOf("\n---", 3) === -1) {
    issues.push({
      line: 1,
      message: "Frontmatter 以 --- 开始，但没有闭合的 ---",
      type: "frontmatter",
    });
  }

  return issues;
}

function splitTableCells(line: string) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
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

    inspect_document_structure: tool({
      description:
        "读取当前 Markdown 的结构锚点：全文、标题、章节、段落、表格、文档末尾。写作或替换位置不明确时先调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const doc = runtime.getDoc();
        const anchors = buildDocumentAnchors(doc);
        return {
          content: formatAnchorList(doc, anchors.slice(0, 90)),
          anchorCount: anchors.length,
          anchors: anchors.slice(0, 90).map(anchorSummary),
          summary: `${anchors.length} 个结构锚点`,
        };
      },
    }),

    read_document: tool({
      description:
        "按全文、范围或 anchorId 读取当前文档内容。长文或位置不明确时，用它读取目标章节/段落/表格。",
      inputSchema: z.object({
        anchorId: z.string().optional(),
        from: z.number().int().min(0).optional(),
        maxChars: z.number().int().min(1).max(60_000).optional(),
        offset: z.number().int().min(0).optional(),
        targetKind: z.enum(["anchor", "document", "range"]).optional(),
        to: z.number().int().min(0).optional(),
      }),
      execute: async ({ anchorId, from, maxChars = 24_000, offset = 0, targetKind, to }) => {
        const doc = runtime.getDoc();
        let range: { from: number; to: number; title: string };

        if (targetKind === "range" || (typeof from === "number" && typeof to === "number")) {
          const start = from ?? 0;
          const end = to ?? doc.length;
          if (start > end || end > doc.length) {
            return { ok: false, error: `读取范围无效（文档长度 ${doc.length}）` };
          }
          range = { from: start, to: end, title: "指定范围" };
        } else if (anchorId?.trim()) {
          const anchor = findAnchor(doc, anchorId);
          if (!anchor) return { ok: false, error: `未找到 anchorId: ${anchorId}` };
          range = { from: anchor.from, to: anchor.to, title: `${anchor.kind}: ${anchor.title}` };
        } else {
          range = { from: 0, to: doc.length, title: "全文" };
        }

        const full = doc.slice(range.from, range.to);
        const content = full.slice(offset, offset + maxChars);
        const truncated = offset + maxChars < full.length;

        return {
          content: [
            `目标: ${range.title}`,
            `范围: ${range.from}-${range.to}`,
            `偏移: ${offset}`,
            truncated ? `状态: 已截断，下次 offset=${offset + maxChars}` : "状态: 完整",
            "",
            content,
          ].join("\n"),
          from: range.from,
          to: range.to,
          truncated,
          summary: `${range.title} · ${full.length} 字符`,
        };
      },
    }),

    locate_content: tool({
      description:
        "根据标题、关键词或用户引用的原文，定位最适合编辑的文档锚点。返回 anchorId，后续用于 replace_content/insert_content。",
      inputSchema: z.object({
        query: z.string().min(1),
        targetKinds: z.array(anchorKindSchema).optional(),
      }),
      execute: async ({ query, targetKinds }) => {
        const doc = runtime.getDoc();
        const matches = locateAnchors(doc, query, targetKinds);
        if (matches.length === 0) {
          const exact = findExactTextRange(doc, query);
          if (exact) {
            return {
              matches: [
                {
                  id: "exact-text",
                  kind: "block",
                  from: exact.from,
                  to: exact.to,
                  title: "精确原文匹配",
                  excerpt: summarizeText(exact.original, 160),
                },
              ],
              summary: "找到精确原文匹配",
            };
          }
          return { ok: false, error: "未找到匹配内容，请换更具体的标题或原文片段" };
        }

        return {
          content: formatAnchorList(doc, matches),
          matches: matches.map(anchorSummary),
          summary: `${matches.length} 个匹配位置`,
        };
      },
    }),

    replace_content: tool({
      description:
        "替换现有 Markdown 内容并生成编辑器 diff 预览。优先使用 anchorId、headingTitle 或 exactText；只有全文重写时才 targetKind=document/anchorId=whole-document。",
      inputSchema: z.object({
        anchorId: z.string().optional(),
        exactText: z.string().optional(),
        from: z.number().int().min(0).optional(),
        headingTitle: z.string().optional(),
        replacement: z.string(),
        summary: z.string().optional(),
        targetKind: z
          .enum(["block", "document", "exact_text", "heading", "range", "section", "table"])
          .optional(),
        to: z.number().int().min(0).optional(),
      }),
      execute: async (input) => {
        const doc = runtime.getDoc();
        const range = resolveReplaceRange(doc, input);
        if ("error" in range) return { ok: false, error: range.error };

        const result = validateAndStoreChanges(
          runtime,
          [{ from: range.from, to: range.to, insert: input.replacement }],
          input.summary ?? `已准备替换 ${range.target?.title ?? `${range.from}-${range.to}`}`,
        );
        if (!result.ok) return result;

        return {
          ...result,
          from: range.from,
          to: range.to,
          target: range.target ? anchorSummary(range.target) : undefined,
          originalExcerpt: summarizeText(range.original, 240),
          replacementExcerpt: summarizeText(input.replacement, 240),
        };
      },
    }),

    insert_content: tool({
      description:
        "在指定 anchor/标题前后或文档末尾插入 Markdown，并生成编辑器 diff 预览。新增章节/段落优先使用此工具。",
      inputSchema: z.object({
        anchorId: z.string().optional(),
        content: z.string().min(1),
        headingTitle: z.string().optional(),
        placement: z
          .enum(["after_anchor", "after_heading", "before_anchor", "before_heading", "document_end"])
          .optional(),
        summary: z.string().optional(),
      }),
      execute: async (input) => {
        const doc = runtime.getDoc();
        const resolved = resolveInsertPosition(doc, input);
        if ("error" in resolved) return { ok: false, error: resolved.error };

        const insert = normalizeInsertedContent(doc, resolved.position, input.content);
        const result = validateAndStoreChanges(
          runtime,
          [{ from: resolved.position, to: resolved.position, insert }],
          input.summary ?? `已准备插入 ${input.content.length} 字符`,
        );
        if (!result.ok) return result;

        return {
          ...result,
          insertedAt: resolved.position,
          target: resolved.target ? anchorSummary(resolved.target) : undefined,
          headingMatched: resolved.headingMatched,
          insertedExcerpt: summarizeText(input.content, 240),
        };
      },
    }),

    batch_edit: tool({
      description:
        "一次准备多处小型结构化编辑。每个 operation 用 anchorId、exactText 或 from/to 定位；不要用于全文重写。",
      inputSchema: z.object({
        operations: z
          .array(
            z.object({
              anchorId: z.string().optional(),
              exactText: z.string().optional(),
              from: z.number().int().min(0).optional(),
              content: z.string().optional(),
              insert: z.string().optional(),
              replacement: z.string().optional(),
              to: z.number().int().min(0).optional(),
              type: z.enum(["delete", "insert", "replace"]),
            }),
          )
          .min(1),
        summary: z.string().optional(),
      }),
      execute: async ({ operations, summary }) => {
        const doc = runtime.getDoc();
        const changes = [];

        for (const [index, operation] of operations.entries()) {
          if (operation.type === "insert") {
            const resolved = operation.anchorId
              ? resolveInsertPosition(doc, { anchorId: operation.anchorId, placement: "after_anchor" })
              : typeof operation.from === "number"
                ? { position: operation.from }
                : { error: "insert 操作需要 anchorId 或 from" };
            if ("error" in resolved) return { ok: false, error: `第 ${index + 1} 项：${resolved.error}` };
            changes.push({
              from: resolved.position,
              to: resolved.position,
              insert: normalizeInsertedContent(
                doc,
                resolved.position,
                operation.content ?? operation.insert ?? operation.replacement ?? "",
              ),
            });
            continue;
          }

          const range = resolveReplaceRange(doc, operation);
          if ("error" in range) return { ok: false, error: `第 ${index + 1} 项：${range.error}` };
          changes.push({
            from: range.from,
            to: range.to,
            insert: operation.type === "delete" ? "" : operation.replacement ?? operation.insert ?? operation.content ?? "",
          });
        }

        const result = validateAndStoreChanges(
          runtime,
          changes,
          summary ?? `已准备 ${changes.length} 处批量编辑`,
        );
        if (!result.ok) return result;
        return result;
      },
    }),

    validate_markdown: tool({
      description:
        "粗略检查 Markdown 结构问题，包括重复标题、表格列数不一致、frontmatter 未闭合。复杂改写后可调用。",
      inputSchema: z.object({
        content: z.string().optional().describe("可选：检查候选 Markdown；省略则检查当前文档"),
      }),
      execute: async ({ content }) => {
        const text = content ?? runtime.getDoc();
        const issues = validateMarkdownStructure(text);
        return {
          issueCount: issues.length,
          issues,
          summary: issues.length > 0 ? `${issues.length} 个 Markdown 结构问题` : "Markdown 结构检查通过",
        };
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

    ...(runtime.imageModel
      ? {
          generate_image: tool({
            description:
              "根据文字描述生成图片。返回可插入文档的 Markdown 图片语法；需要写入文档时请再调用 append_content。",
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
                  summary: "图片已生成",
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
