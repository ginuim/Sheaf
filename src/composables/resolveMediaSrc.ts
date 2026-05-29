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
