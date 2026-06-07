import { isTauri } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { GeneratedImage } from "./image-generation";

function documentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx <= 0) return filePath;
  return filePath.slice(0, idx);
}

function joinPath(dir: string, fileName: string) {
  const separator = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(separator) ? `${dir}${fileName}` : `${dir}${separator}${fileName}`;
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export type SavedGeneratedImage = {
  markdown: string;
  src: string;
  savedPath?: string;
};

export async function saveGeneratedImageAsset(
  documentPath: string | null,
  image: GeneratedImage,
  alt = "生成的图片",
): Promise<SavedGeneratedImage> {
  const ext = extensionForMime(image.mimeType);
  const fileName = `sheaf-gen-${Date.now()}.${ext}`;

  if (documentPath && isTauri()) {
    const dir = documentDir(documentPath);
    const fullPath = joinPath(dir, fileName);
    await writeFile(fullPath, image.bytes);
    return {
      markdown: `![${alt}](${fileName})`,
      src: fileName,
      savedPath: fullPath,
    };
  }

  const dataUrl = bytesToDataUrl(image.bytes, image.mimeType);
  return {
    markdown: `![${alt}](${dataUrl})`,
    src: dataUrl,
  };
}
