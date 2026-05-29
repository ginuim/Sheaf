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
  return `<section style="${theme.styles.section}">${wrapper.innerHTML}</section>`;
}

/** 从 HTML 提取纯文本（复制备用） */
export function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}
