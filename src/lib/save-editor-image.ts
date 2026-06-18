import { isTauri } from "@tauri-apps/api/core";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import type { ImageHostingPreferences } from "./appPreferences";
import {
  shouldUploadToDefaultImageHost,
  uploadToDefaultImageHost,
} from "./imageHosting";

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export type SavedEditorImage = {
  alt: string;
  markdown: string;
  src: string;
  savedPath?: string;
};

function documentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx <= 0) return filePath;
  return filePath.slice(0, idx);
}

function joinPath(dir: string, fileName: string) {
  const separator = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(separator) ? `${dir}${fileName}` : `${dir}${separator}${fileName}`;
}

function extensionFromName(fileName: string): string {
  const fromName = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && ALLOWED_IMAGE_EXTENSIONS.has(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return "png";
}

function imageExtension(file: File): string {
  const fromMime = IMAGE_MIME_EXTENSIONS[file.type.toLowerCase()];
  if (fromMime) return fromMime;
  return extensionFromName(file.name);
}

function imageExtensionFromPath(sourcePath: string): string {
  return extensionFromName(sourcePath.split(/[/\\]/).pop() ?? sourcePath);
}

function sanitizeImageBaseName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._\s-]+|[._\s-]+$/g, "");

  return normalized.slice(0, 80) || "image";
}

function altFromFileName(fileName: string): string {
  return sanitizeImageBaseName(fileName);
}

async function uniqueFileName(dir: string, baseName: string, extension: string): Promise<string> {
  const first = `${baseName}.${extension}`;
  if (!(await exists(joinPath(dir, first)))) return first;

  for (let attempt = 1; attempt < 1000; attempt += 1) {
    const candidate = `${baseName}-${attempt}.${extension}`;
    if (!(await exists(joinPath(dir, candidate)))) return candidate;
  }

  return `${baseName}-${Date.now()}.${extension}`;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function buildSavedImage(alt: string, src: string, savedPath?: string): SavedEditorImage {
  return {
    alt,
    src,
    savedPath,
    markdown: `![${alt}](${src})`,
  };
}

async function saveEditorImageBytes(
  documentPath: string | null,
  sourceName: string,
  extension: string,
  bytes: Uint8Array,
  mimeType?: string,
  imageHosting?: ImageHostingPreferences,
): Promise<SavedEditorImage> {
  const alt = altFromFileName(sourceName);
  const resolvedMime = mimeType || `image/${extension === "jpg" ? "jpeg" : extension}`;

  if (imageHosting && shouldUploadToDefaultImageHost(imageHosting)) {
    const hosted = await uploadToDefaultImageHost(imageHosting, {
      bytes,
      extension,
      mimeType: resolvedMime,
      sourceName,
    });
    return buildSavedImage(hosted.alt, hosted.src);
  }

  if (documentPath && isTauri()) {
    const dir = documentDir(documentPath);
    const baseName = sanitizeImageBaseName(sourceName);
    const fileName = await uniqueFileName(dir, baseName, extension);
    const fullPath = joinPath(dir, fileName);
    await writeFile(fullPath, bytes);
    return buildSavedImage(alt, fileName, fullPath);
  }

  const dataUrl = bytesToDataUrl(bytes, resolvedMime);
  return buildSavedImage(alt, dataUrl);
}

export async function saveEditorImageFile(
  documentPath: string | null,
  file: File,
  imageHosting?: ImageHostingPreferences,
): Promise<SavedEditorImage> {
  const extension = imageExtension(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return saveEditorImageBytes(documentPath, file.name, extension, bytes, file.type, imageHosting);
}

export async function saveEditorImageFromPath(
  documentPath: string | null,
  sourcePath: string,
  imageHosting?: ImageHostingPreferences,
): Promise<SavedEditorImage> {
  const sourceName = sourcePath.split(/[/\\]/).pop() ?? "image.png";
  const extension = imageExtensionFromPath(sourcePath);
  const bytes = await readFile(sourcePath);
  return saveEditorImageBytes(documentPath, sourceName, extension, bytes, undefined, imageHosting);
}
