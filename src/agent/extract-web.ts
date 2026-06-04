const maxExtractChars = 14_000;

export function extractReadableTextFromHtml(html: string, url: string, maxChars = maxExtractChars): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const tag of ["script", "style", "noscript", "svg", "nav", "footer", "header"]) {
    doc.querySelectorAll(tag).forEach((node) => node.remove());
  }

  const title = doc.querySelector("title")?.textContent?.trim() ?? "";
  const article = doc.querySelector("article, main, [role='main']");
  const root = article ?? doc.body;
  const text = normalizeWhitespace(root?.textContent ?? "");

  const header = title ? `标题: ${title}\n来源: ${url}\n\n` : `来源: ${url}\n\n`;
  const body = truncateText(text, maxChars - header.length);
  return `${header}${body}`.trim();
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[内容已截断]`;
}
