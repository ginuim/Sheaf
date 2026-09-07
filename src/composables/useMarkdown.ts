import MarkdownIt from "markdown-it";
import markdownItKatex from "markdown-it-katex";
import katex from "katex";
import { applyChineseEnglishSpacingToMarkdownTokens } from "../lib/cjkSpacing";
import { loadExportTypographySettings } from "../lib/exportTypographySettings";
import { resolveMediaPath, resolveMediaSrc } from "./resolveMediaSrc";
import { buildHeadingIds, normalizeMarkdownSource } from "./useOutline";

const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: "#b42318",
} as const;

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

md.use(markdownItKatex, KATEX_OPTIONS);

// markdown-it-katex 会把块级公式包进 <p>，在 preview 的大 line-height 下会被裁切。
md.renderer.rules.math_block = (tokens, idx) => {
  const token = tokens[idx];
  const content = token.content.trim();
  const sourceLineAttrs = getSourceLineAttrs(token);
  try {
    const html = katex.renderToString(content, {
      ...KATEX_OPTIONS,
      displayMode: true,
    });
    return `<div class="math-block"${sourceLineAttrs}>${html}</div>\n`;
  } catch {
    return `<pre class="math-block-error"${sourceLineAttrs}>${md.utils.escapeHtml(content)}</pre>\n`;
  }
};

const defaultFence =
  md.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
  if (language !== "mermaid") return defaultFence(tokens, idx, options, env, self);

  const content = md.utils.escapeHtml(token.content.trim());
  return `<div class="mermaid"${getSourceLineAttrs(token)} data-mermaid-source="${content}">${content}</div>\n`;
};

const defaultHeadingOpen =
  md.renderer.rules.heading_open ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const id = env.headingIds?.shift();
  if (id) token.attrSet("id", id);
  return defaultHeadingOpen(tokens, idx, options, env, self);
};

const defaultImageRender =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");
  if (src) {
    token.attrSet("data-sheaf-md-src", src);
  }
  if (token.map) {
    const [start, end] = token.map;
    token.attrSet("data-source-line", String(start));
    token.attrSet("data-source-line-end", String(Math.max(start, end - 1)));
  }
  if (src && env.docFilePath) {
    const localPath = resolveMediaPath(env.docFilePath, src);
    if (localPath) {
      token.attrSet("data-sheaf-local-src", localPath);
    }
    const resolveMedia = typeof env.resolveMedia === "function"
      ? env.resolveMedia
      : resolveMediaSrc;
    token.attrSet("src", resolveMedia(env.docFilePath, src));
  }
  token.attrJoin("class", "preview-image");
  return defaultImageRender(tokens, idx, options, env, self);
};

function getSourceLineAttrs(token: { map: [number, number] | null }) {
  if (!token.map) return "";
  const [start, end] = token.map;
  return ` data-source-line="${start}" data-source-line-end="${Math.max(start, end - 1)}"`;
}

md.core.ruler.after("inline", "source_line_attrs", (state) => {
  for (const token of state.tokens) {
    if (!token.map) continue;
    if (token.nesting !== 1 && token.type !== "fence" && token.type !== "code_block") {
      continue;
    }

    const [start, end] = token.map;
    token.attrSet("data-source-line", String(start));
    token.attrSet("data-source-line-end", String(Math.max(start, end - 1)));
  }
});

md.core.ruler.after("inline", "loose_strong_after_punctuation", (state) => {
  for (const blockToken of state.tokens) {
    if (blockToken.type !== "inline" || !blockToken.children) continue;

    const nextChildren = [];
    for (const token of blockToken.children) {
      if (token.type !== "text" || !token.content.includes("**")) {
        nextChildren.push(token);
        continue;
      }

      const pattern = /\*\*(\S(?:[^*\n]|\*(?!\*))*?\S)\*\*/gu;
      let cursor = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(token.content)) !== null) {
        const [raw, content] = match;
        if (match.index > cursor) {
          const textToken = new state.Token("text", "", 0);
          textToken.content = token.content.slice(cursor, match.index);
          nextChildren.push(textToken);
        }

        const openToken = new state.Token("strong_open", "strong", 1);
        openToken.markup = "**";
        const contentToken = new state.Token("text", "", 0);
        contentToken.content = content;
        const closeToken = new state.Token("strong_close", "strong", -1);
        closeToken.markup = "**";
        nextChildren.push(openToken, contentToken, closeToken);

        cursor = match.index + raw.length;
      }

      if (cursor === 0) {
        nextChildren.push(token);
        continue;
      }

      if (cursor < token.content.length) {
        const textToken = new state.Token("text", "", 0);
        textToken.content = token.content.slice(cursor);
        nextChildren.push(textToken);
      }
    }

    blockToken.children = nextChildren;
  }
});

md.core.ruler.after("inline", "cjk_spacing", (state) => {
  if (!state.env?.chineseEnglishSpacing) return;

  for (const token of state.tokens) {
    if (token.type !== "inline") continue;
    applyChineseEnglishSpacingToMarkdownTokens(token.children as any);
  }
});

export type RenderMarkdownOptions = {
  resolveMedia?: (docFilePath: string | null, src: string) => string;
  chineseEnglishSpacing?: boolean;
};

export function renderMarkdown(
  source: string,
  docFilePath: string | null = null,
  options: RenderMarkdownOptions = {},
): string {
  const normalizedSource = normalizeMarkdownSource(source);
  const items = buildHeadingIds(normalizedSource);
  const chineseEnglishSpacing =
    options.chineseEnglishSpacing ?? loadExportTypographySettings().chineseEnglishSpacing;
  return md.render(normalizedSource, {
    headingIds: items.map((item) => item.id),
    docFilePath,
    resolveMedia: options.resolveMedia,
    chineseEnglishSpacing,
  });
}
