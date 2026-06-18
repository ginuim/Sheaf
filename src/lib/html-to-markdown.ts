type ListContext = {
  type: "ul" | "ol";
  index: number;
};

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([*_`[\]])/g, "\\$1");
}

function escapeMarkdownUrl(value: string): string {
  return value.replace(/\)/g, "%29").trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}

function trimBlankLines(value: string): string {
  return value.replace(/^[\t ]*\n+/g, "").replace(/\n+[\t ]*$/g, "");
}

function squeezeBlankLines(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function isBlockElement(node: ChildNode): boolean {
  return node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName.toLowerCase());
}

function renderChildren(node: Node, lists: ListContext[] = []): string {
  let output = "";
  node.childNodes.forEach((child, index) => {
    const rendered = renderNode(child, lists);
    if (!rendered) return;

    const previous = node.childNodes[index - 1];
    if (output && (isBlockElement(child) || (previous && isBlockElement(previous)))) {
      output += "\n\n";
    }
    output += rendered;
  });
  return output;
}

function renderInlineChildren(element: Element, lists: ListContext[] = []): string {
  return normalizeWhitespace(renderChildren(element, lists)).trim();
}

function renderList(element: Element, type: "ul" | "ol", lists: ListContext[]): string {
  const context: ListContext = { type, index: 1 };
  const items = Array.from(element.children)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((child) => renderListItem(child, [...lists, context]))
    .filter(Boolean);
  return items.join("\n");
}

function renderListItem(element: Element, lists: ListContext[]): string {
  const context = lists[lists.length - 1];
  if (!context) return "";

  const nestedBlocks: string[] = [];
  let inline = "";

  element.childNodes.forEach((child) => {
    if (child instanceof HTMLElement && ["ul", "ol"].includes(child.tagName.toLowerCase())) {
      nestedBlocks.push(renderNode(child, lists));
      return;
    }
    inline += renderNode(child, lists);
  });

  const marker = context.type === "ol" ? `${context.index}. ` : "- ";
  context.index += 1;
  const indent = "  ".repeat(Math.max(0, lists.length - 1));
  const body = normalizeWhitespace(inline).trim();
  const firstLine = `${indent}${marker}${body}`;
  const nested = nestedBlocks
    .map((block) => block
      .split("\n")
      .map((line) => `${indent}  ${line}`)
      .join("\n"))
    .filter(Boolean)
    .join("\n");

  return nested ? `${firstLine}\n${nested}` : firstLine;
}

function renderTable(element: Element, lists: ListContext[]): string {
  const rows = Array.from(element.querySelectorAll("tr"))
    .map((row) => Array.from(row.children)
      .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
      .map((cell) => renderInlineChildren(cell, lists).replace(/\|/g, "\\|")))
    .filter((row) => row.length > 0);

  if (!rows.length) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  const header = normalizedRows[0]!;
  const separator = Array.from({ length: columnCount }, () => "---");
  const body = normalizedRows.slice(1);

  return [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function wrapInline(element: Element, marker: string, lists: ListContext[]): string {
  const content = renderInlineChildren(element, lists);
  return content ? `${marker}${content}${marker}` : "";
}

function renderNode(node: Node, lists: ListContext[] = []): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(normalizeWhitespace(node.textContent ?? ""));
  }

  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "style":
    case "script":
    case "meta":
    case "link":
      return "";
    case "br":
      return "\n";
    case "strong":
    case "b":
      return wrapInline(node, "**", lists);
    case "em":
    case "i":
      return wrapInline(node, "*", lists);
    case "s":
    case "strike":
    case "del":
      return wrapInline(node, "~~", lists);
    case "code": {
      const content = (node.textContent ?? "").replace(/`/g, "\\`");
      return content ? `\`${content}\`` : "";
    }
    case "pre": {
      const code = node.querySelector("code");
      const content = (code?.textContent ?? node.textContent ?? "").replace(/\n+$/g, "");
      return content ? `\`\`\`\n${content}\n\`\`\`` : "";
    }
    case "a": {
      const href = node.getAttribute("href");
      const text = renderInlineChildren(node, lists) || href || "";
      return href ? `[${text}](${escapeMarkdownUrl(href)})` : text;
    }
    case "img": {
      const src = node.getAttribute("src");
      if (!src) return "";
      const alt = escapeMarkdownText(node.getAttribute("alt") ?? "");
      return `![${alt}](${escapeMarkdownUrl(src)})`;
    }
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag.slice(1));
      const content = renderInlineChildren(node, lists);
      return content ? `${"#".repeat(level)} ${content}` : "";
    }
    case "p":
    case "div":
    case "section":
    case "article":
    case "header":
    case "footer":
    case "main":
    case "aside": {
      return trimBlankLines(renderChildren(node, lists));
    }
    case "blockquote": {
      const content = trimBlankLines(renderChildren(node, lists));
      return content
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    }
    case "ul":
      return renderList(node, "ul", lists);
    case "ol":
      return renderList(node, "ol", lists);
    case "table":
      return renderTable(node, lists);
    case "hr":
      return "---";
    case "tr":
    case "td":
    case "th":
    case "thead":
    case "tbody":
    case "tfoot":
      return renderChildren(node, lists);
    default:
      return renderChildren(node, lists);
  }
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";

  const document = new DOMParser().parseFromString(html, "text/html");
  return squeezeBlankLines(trimBlankLines(renderChildren(document.body))).trim();
}
