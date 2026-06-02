import { isTauri } from "@tauri-apps/api/core";
import {
  htmlToPlainText,
  markdownToWechatHtml,
  markdownToWechatHtmlWithImages,
} from "../lib/wechatHtml";
import type { WechatThemeId } from "../lib/wechatThemes";

export type CopyResult = { ok: true } | { ok: false; message: string };

/** 用选区 + execCommand 复制富文本（不依赖用户手势窗口，但 WebKit 下成功率一般） */
function copyHtmlBySelection(html: string): boolean {
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.innerHTML = html;
  container.setAttribute("style", [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:677px",
    "opacity:0",
    "pointer-events:none",
  ].join(";"));
  document.body.appendChild(container);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  selection?.removeAllRanges();
  container.remove();
  return ok;
}

async function writeClipboardHtml(html: string, plain: string): Promise<void> {
  if (isTauri()) {
    const { writeHtml } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeHtml(html, plain);
    return;
  }

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // 异步任务后浏览器常因失去用户手势而失败，继续尝试其它方式
    }
  }

  if (copyHtmlBySelection(html)) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(html);
    return;
  }

  throw new Error("clipboard unavailable");
}

export function buildWechatHtml(
  source: string,
  themeId: WechatThemeId,
  docFilePath: string | null = null,
): string {
  return markdownToWechatHtml(source, themeId, docFilePath);
}

export function buildWechatHtmlForCopy(
  source: string,
  themeId: WechatThemeId,
  docFilePath: string | null = null,
  isDark = false,
): Promise<string> {
  return markdownToWechatHtmlWithImages(source, themeId, docFilePath, isDark);
}

export async function copyWechatHtml(
  html: string,
): Promise<CopyResult> {
  const plain = htmlToPlainText(html);

  try {
    await writeClipboardHtml(html, plain);
    return { ok: true };
  } catch (error) {
    console.error("copyWechatHtml failed:", error);
    return {
      ok: false,
      message: isTauri()
        ? "复制失败，请重试。若仍失败，可在预览区全选后手动复制。"
        : "复制失败，请检查剪贴板权限或手动全选预览区复制。",
    };
  }
}

export async function copyPlainText(text: string): Promise<CopyResult> {
  try {
    if (isTauri()) {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "复制失败，请检查剪贴板权限。",
    };
  }
}
