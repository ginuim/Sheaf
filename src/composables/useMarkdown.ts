import MarkdownIt from "markdown-it";
import { resolveMediaSrc } from "./resolveMediaSrc";
import { buildHeadingIds } from "./useOutline";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

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
    token.attrSet("src", resolveMediaSrc(env.docFilePath, src));
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

export function renderMarkdown(
  source: string,
  docFilePath: string | null = null,
): string {
  const items = buildHeadingIds(source);
  return md.render(source, {
    headingIds: items.map((item) => item.id),
    docFilePath,
  });
}
