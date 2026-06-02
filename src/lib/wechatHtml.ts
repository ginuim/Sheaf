import { renderMarkdown } from "../composables/useMarkdown";
import { renderMermaidIn } from "../composables/useMermaid";
import { getWechatTheme, type WechatThemeId } from "./wechatThemes";
import { toPng } from "html-to-image";

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

function createCaptureHost(html: string): HTMLDivElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "677px";
  host.style.padding = "0";
  host.style.background = "transparent";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  return host;
}

function getImageStyle(styles: Record<string, string>): string {
  return [
    styles.img,
    "background: transparent;",
    "vertical-align: middle;",
  ]
    .filter(Boolean)
    .join(" ");
}

function getInlineImageStyle(): string {
  return [
    "display: inline-block;",
    "max-width: 100%;",
    "height: 1.2em;",
    "margin: 0 2px;",
    "border-radius: 0;",
    "background: transparent;",
    "vertical-align: -0.25em;",
  ].join(" ");
}

function replaceWithImage(
  target: HTMLElement,
  src: string,
  styles: Record<string, string>,
  inline = false,
) {
  const img = document.createElement("img");
  img.src = src;
  img.alt =
    target.classList.contains("mermaid")
      ? "Mermaid diagram"
      : target.textContent?.trim() || "Formula";
  img.setAttribute("style", inline ? getInlineImageStyle() : getImageStyle(styles));
  target.replaceWith(img);
}

type CaptureTarget = {
  el: HTMLElement;
  inline: boolean;
};

function getCaptureTargets(root: HTMLElement): CaptureTarget[] {
  const blockTargets = Array.from(
    root.querySelectorAll<HTMLElement>(".mermaid, .katex-display"),
  ).map((el) => ({ el, inline: false }));

  const inlineMathTargets = Array.from(
    root.querySelectorAll<HTMLElement>(".katex"),
  )
    .filter((el) => !el.closest(".katex-display"))
    .map((el) => ({ el, inline: true }));

  return [...blockTargets, ...inlineMathTargets];
}

/** 跳过远程字体内联，避免 Google Fonts 跨域 stylesheet 触发 SecurityError */
const PNG_CAPTURE_BASE = {
  cacheBust: true,
  backgroundColor: "transparent",
  skipFonts: true,
} as const;

function getCaptureOptions(inline: boolean) {
  return inline
    ? { ...PNG_CAPTURE_BASE, pixelRatio: 3 }
    : { ...PNG_CAPTURE_BASE, pixelRatio: 2 };
}

function prepareInlineCapture(target: HTMLElement): () => void {
  const previous = target.style.transform;
  target.style.transform = "scale(2)";
  target.style.transformOrigin = "left center";
  return () => {
    target.style.transform = previous;
  };
}

async function captureTargetAsPng(target: CaptureTarget): Promise<string> {
  const restore = target.inline ? prepareInlineCapture(target.el) : () => {};
  try {
    return await toPng(
      target.el,
      getCaptureOptions(target.inline),
    );
  } finally {
    restore();
  }
}

function replaceCaptureTargetWithImage(
  target: CaptureTarget,
  dataUrl: string,
  styles: Record<string, string>,
) {
  replaceWithImage(
    target.el,
    dataUrl,
    styles,
    target.inline,
  );
}

async function replaceSpecialBlocksWithImages(
  root: HTMLElement,
  styles: Record<string, string>,
  isDark: boolean,
) {
  await renderMermaidIn(root, isDark);
  await document.fonts.ready;

  for (const target of getCaptureTargets(root)) {
    try {
      const dataUrl = await captureTargetAsPng(target);
      replaceCaptureTargetWithImage(target, dataUrl, styles);
    } catch (error) {
      console.error("Wechat image render error:", error);
    }
  }
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

/** Markdown → 公众号 HTML，并把 Mermaid 与块级公式转成图片 */
export async function markdownToWechatHtmlWithImages(
  source: string,
  themeId: WechatThemeId,
  docFilePath: string | null = null,
  isDark = false,
): Promise<string> {
  const theme = getWechatTheme(themeId);
  const host = createCaptureHost(markdownToWechatHtml(source, themeId, docFilePath));
  try {
    await replaceSpecialBlocksWithImages(host, theme.styles, isDark);
    return host.innerHTML;
  } finally {
    host.remove();
  }
}

/** 从 HTML 提取纯文本（复制备用） */
export function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}
