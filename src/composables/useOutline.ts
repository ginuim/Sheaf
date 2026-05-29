export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .trim();
}

export function slugify(text: string): string {
  const plain = stripInlineMarkdown(text);
  const slug = plain
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug;
}

export function buildHeadingIds(source: string): OutlineItem[] {
  const lines = source.split("\n");
  const counts = new Map<string, number>();
  const items: OutlineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/);
    if (!match) continue;

    const level = match[1].length;
    const text = stripInlineMarkdown(match[2]);
    const base = slugify(text) || `heading-${items.length + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;

    items.push({ id, level, text, line: i });
  }

  return items;
}

export function parseOutline(source: string): OutlineItem[] {
  return buildHeadingIds(source);
}
