import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

function documentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx <= 0) return filePath;
  return filePath.slice(0, idx);
}

function isExternalSrc(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src) || src.startsWith("data:");
}

function isAbsoluteFsPath(src: string): boolean {
  return src.startsWith("/") || /^[A-Za-z]:[/\\]/.test(src);
}

function fileBaseUrl(dir: string): string {
  const normalized = dir.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//i.test(normalized)) {
    return `file:///${normalized}/`;
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}/`;
  }
  return `file:///${normalized}/`;
}

function resolveRelativePath(baseDir: string, relative: string): string {
  const url = new URL(relative, fileBaseUrl(baseDir));
  let pathname = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  if (baseDir.includes("\\")) {
    return pathname.replace(/\//g, "\\");
  }
  return pathname;
}

function fileUrlToPath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== "file:") return null;
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname;
  } catch {
    return null;
  }
}

export type ResolvedLink =
  | { type: "external"; href: string }
  | { type: "local"; path: string };

export type ResolveLinkResult =
  | ResolvedLink
  | { type: "error"; message: string };

/** 将 Markdown 链接 href 解析为外部 URL 或本地文件路径 */
export function resolveLinkHref(
  docFilePath: string | null,
  href: string,
): ResolveLinkResult {
  const trimmed = href.trim();
  if (!trimmed) {
    return { type: "error", message: "链接无效。" };
  }

  if (trimmed.startsWith("file://")) {
    const path = fileUrlToPath(trimmed);
    if (!path) {
      return { type: "error", message: "无法解析本地链接。" };
    }
    return { type: "local", path };
  }

  if (isExternalSrc(trimmed)) {
    return { type: "external", href: trimmed };
  }

  if (isAbsoluteFsPath(trimmed)) {
    return { type: "local", path: trimmed };
  }

  if (!docFilePath) {
    return { type: "error", message: "请先保存文档后再打开相对链接。" };
  }

  return {
    type: "local",
    path: resolveRelativePath(documentDir(docFilePath), trimmed),
  };
}

/** 将 Markdown 中的本地图片路径转为 WebView 可加载的 URL */
export function resolveMediaSrc(
  docFilePath: string | null,
  src: string,
): string {
  if (!docFilePath || !src.trim()) return src;
  if (isExternalSrc(src)) return src;

  const absolute = isAbsoluteFsPath(src)
    ? src
    : resolveRelativePath(documentDir(docFilePath), src);

  return isTauri() ? convertFileSrc(absolute) : absolute;
}
