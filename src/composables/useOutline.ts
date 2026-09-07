import MarkdownIt from "markdown-it";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

const outlineMarkdown = new MarkdownIt({ html: true });

type InlineToken = NonNullable<ReturnType<typeof outlineMarkdown.parse>[number]["children"]>[number];

export function normalizeMarkdownSource(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

function plainTextFromInlineToken(token: InlineToken): string {
  if (token.type === "softbreak" || token.type === "hardbreak") return " ";
  if (token.type === "html_inline") return "";
  if (token.children?.length) {
    return token.children.map(plainTextFromInlineToken).join("");
  }
  return token.content;
}

function getHeadingText(token: InlineToken): string {
  const text = token.children?.length
    ? token.children.map(plainTextFromInlineToken).join("")
    : token.content;
  return text.replace(/\s+/gu, " ").trim();
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug;
}

export function buildHeadingIds(source: string): OutlineItem[] {
  const tokens = outlineMarkdown.parse(normalizeMarkdownSource(source), {});
  const counts = new Map<string, number>();
  const items: OutlineItem[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "heading_open") continue;

    const inlineToken = tokens[i + 1];
    if (inlineToken?.type !== "inline") continue;

    const level = Number(token.tag.slice(1));
    const text = getHeadingText(inlineToken);
    const base = slugify(text) || `heading-${items.length + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;

    items.push({ id, level, text, line: token.map?.[0] ?? 0 });
  }

  return items;
}

export function parseOutline(source: string): OutlineItem[] {
  return buildHeadingIds(source);
}
