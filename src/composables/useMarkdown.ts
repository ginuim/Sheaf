import MarkdownIt from "markdown-it";
import markdownItKatex from "markdown-it-katex";
import katex from "katex";
import { resolveMediaSrc } from "./resolveMediaSrc";
import { buildHeadingIds } from "./useOutline";

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
  const content = tokens[idx].content.trim();
  try {
    const html = katex.renderToString(content, {
      ...KATEX_OPTIONS,
      displayMode: true,
    });
    return `<div class="math-block">${html}</div>\n`;
  } catch {
    return `<pre class="math-block-error">${md.utils.escapeHtml(content)}</pre>\n`;
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
  return `<div class="mermaid" data-mermaid-source="${content}">${content}</div>\n`;
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
  if (src && env.docFilePath) {
    const resolveMedia = typeof env.resolveMedia === "function"
      ? env.resolveMedia
      : resolveMediaSrc;
    token.attrSet("src", resolveMedia(env.docFilePath, src));
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

export type RenderMarkdownOptions = {
  resolveMedia?: (docFilePath: string | null, src: string) => string;
};

export function renderMarkdown(
  source: string,
  docFilePath: string | null = null,
  options: RenderMarkdownOptions = {},
): string {
  const items = buildHeadingIds(source);
  return md.render(source, {
    headingIds: items.map((item) => item.id),
    docFilePath,
    resolveMedia: options.resolveMedia,
  });
}
