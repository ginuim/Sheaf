import { htmlToPlainText, markdownToWechatHtml } from "../lib/wechatHtml";
import type { WechatThemeId } from "../lib/wechatThemes";

export type CopyResult = { ok: true } | { ok: false; message: string };

async function writeClipboardHtml(html: string, plain: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(html);
}

export function buildWechatHtml(
  source: string,
  themeId: WechatThemeId,
  docFilePath: string | null = null,
): string {
  return markdownToWechatHtml(source, themeId, docFilePath);
}

export async function copyWechatHtml(
  html: string,
): Promise<CopyResult> {
  const plain = htmlToPlainText(html);

  try {
    await writeClipboardHtml(html, plain);
    return { ok: true };
  } catch {
    try {
      await navigator.clipboard.writeText(html);
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: "复制失败，请检查剪贴板权限或手动全选预览区复制。",
      };
    }
  }
}

export async function copyPlainText(text: string): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "复制失败，请检查剪贴板权限。",
    };
  }
}
