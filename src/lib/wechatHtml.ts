import { renderMarkdown } from "../composables/useMarkdown";
import { getWechatTheme, type WechatThemeId } from "./wechatThemes";

const STYLED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "code",
  "pre",
  "hr",
  "img",
  "table",
  "th",
  "td",
] as const;

function applyInlineStyles(root: HTMLElement, styles: Record<string, string>) {
  for (const tag of STYLED_TAGS) {
    const style = styles[tag];
    if (!style) continue;
    root.querySelectorAll(tag).forEach((el) => {
      el.setAttribute("style", style);
    });
  }

  root.querySelectorAll("pre code").forEach((el) => {
    el.setAttribute("style", styles.codeInPre ?? styles.code);
  });

  // markdown-it 列表项内常包一层 p，去掉多余间距
  root.querySelectorAll("li p").forEach((el) => {
    el.setAttribute("style", "margin: 0; line-height: inherit;");
  });
}

/** 去掉 li 内多余的 p，避免公众号粘贴时按段落拆行 */
function unwrapLiParagraphs(root: HTMLElement) {
  root.querySelectorAll("li > p").forEach((p) => {
    const li = p.parentElement;
    if (!li) return;
    const fragment = document.createDocumentFragment();
    while (p.firstChild) fragment.appendChild(p.firstChild);
    li.insertBefore(fragment, p);
    li.removeChild(p);
  });
}

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "SECTION",
  "UL",
  "OL",
  "LI",
  "PRE",
  "TABLE",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "IMG",
]);

/**
 * 公众号粘贴会把 strong/em 当成块边界，在闭合标签后插入换行（如「标题」与「: 说明」分行）。
 * 改用带内联样式的 span，语义相同且粘贴后仍保持同行。
 */
function replaceSemanticInlineTags(root: HTMLElement) {
  for (const tag of ["strong", "em"] as const) {
    root.querySelectorAll(tag).forEach((el) => {
      const span = document.createElement("span");
      const style = el.getAttribute("style");
      if (style) span.setAttribute("style", style);
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
    });
  }
}

function isStyledLabelSpan(el: Element): boolean {
  const style = el.getAttribute("style") ?? "";
  return /font-weight\s*:\s*(600|bold|700)/i.test(style);
}

/**
 * 公众号会在「加粗 span」与紧随其后的「：说明」之间插入 <section>。
 * 把行首的冒号收进加粗 span（如「数据主权：」），避免冒号单独掉到下一行。
 */
function glueColonIntoStyledLabelSpan(root: HTMLElement) {
  root.querySelectorAll("span").forEach((span) => {
    if (!isStyledLabelSpan(span)) return;
    const next = span.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) return;
    const text = next.textContent ?? "";
    const match = text.match(/^(\s*[：:])/);
    if (!match) return;
    span.appendChild(document.createTextNode(match[1]));
    next.textContent = text.slice(match[1].length);
    if (!next.textContent?.length) next.parentNode?.removeChild(next);
  });
}

/** 将容器内多个行内子节点包进同一 span，减少公众号在 li/p 下按子节点拆 section */
function wrapInlineChildren(root: HTMLElement, selector: string) {
  root.querySelectorAll(selector).forEach((container) => {
    const nodes = Array.from(container.childNodes);
    if (nodes.length <= 1) return;
    const hasBlockChild = nodes.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE &&
        BLOCK_TAGS.has((n as Element).tagName),
    );
    if (hasBlockChild) return;

    const wrap = document.createElement("span");
    wrap.setAttribute("style", "display: inline; line-height: inherit;");
    nodes.forEach((n) => wrap.appendChild(n));
    container.appendChild(wrap);
  });
}

function adaptHtmlForWechatPaste(root: HTMLElement) {
  unwrapLiParagraphs(root);
  replaceSemanticInlineTags(root);
  glueColonIntoStyledLabelSpan(root);
  wrapInlineChildren(root, "li");
  wrapInlineChildren(root, "p");
}

/** Markdown → 公众号兼容的内联样式 HTML */
export function markdownToWechatHtml(
  source: string,
  themeId: WechatThemeId,
  docFilePath: string | null = null,
): string {
  const theme = getWechatTheme(themeId);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderMarkdown(source, docFilePath);
  applyInlineStyles(wrapper, theme.styles);
  adaptHtmlForWechatPaste(wrapper);
  return `<section style="${theme.styles.section}">${wrapper.innerHTML}</section>`;
}

/** 从 HTML 提取纯文本（复制备用） */
export function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}
