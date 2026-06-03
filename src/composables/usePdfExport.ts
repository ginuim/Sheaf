import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  buildMarkdownHtmlDocument,
  exportDocumentFileName,
} from "./documentExport";
import { renderMarkdown } from "./useMarkdown";
import { renderMermaidIn } from "./useMermaid";
import { resolveMediaSrcForExport } from "./resolveMediaSrc";

export type ExportPdfStage = "rendering" | "exporting";

export type ExportPdfResult =
  | { status: "success"; fileName: string; savedPath?: string }
  | { status: "canceled" };

export type ExportPdfOptions = {
  onStage?: (stage: ExportPdfStage) => void;
};

async function renderExportBodyHtml(
  source: string,
  docFilePath: string | null,
): Promise<string> {
  const container = document.createElement("div");
  container.style.display = "none";
  document.body.appendChild(container);

  try {
    container.innerHTML = renderMarkdown(source, docFilePath, {
      resolveMedia: resolveMediaSrcForExport,
    });
    await renderMermaidIn(container, false);
    await document.fonts.ready;
    return container.innerHTML;
  } finally {
    container.remove();
  }
}

async function exportPdfViaBrowserPrint(html: string, fileName: string) {
  const frame = document.createElement("iframe");
  frame.title = fileName;
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.setAttribute("aria-hidden", "true");
  frame.srcdoc = html;

  await new Promise<void>((resolve) => {
    let settled = false;
    const resolveReady = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(loadTimeout);
      resolve();
    };

    frame.addEventListener("load", resolveReady, { once: true });
    document.body.appendChild(frame);
    const loadTimeout = window.setTimeout(resolveReady, 700);
  });

  const printWindow = frame.contentWindow;
  if (!printWindow || typeof printWindow.print !== "function") {
    frame.remove();
    throw new Error("当前环境无法打印 PDF，请使用桌面版应用导出。");
  }

  await new Promise<void>((resolve, reject) => {
    let cleanupTimeout: number | null = null;
    const cleanup = () => {
      printWindow.removeEventListener("afterprint", onDone);
      window.removeEventListener("afterprint", onDone);
      if (cleanupTimeout !== null) window.clearTimeout(cleanupTimeout);
      frame.remove();
    };
    const onDone = () => {
      cleanup();
      resolve();
    };

    try {
      printWindow.addEventListener("afterprint", onDone, { once: true });
      window.addEventListener("afterprint", onDone, { once: true });
      cleanupTimeout = window.setTimeout(onDone, 60_000);
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function exportPdf(
  source: string,
  fileName: string,
  docFilePath: string | null = null,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  options.onStage?.("rendering");

  const bodyHtml = await renderExportBodyHtml(source, docFilePath);
  const html = buildMarkdownHtmlDocument({
    bodyHtml,
    title: fileName,
  });

  options.onStage?.("exporting");

  if (isTauri()) {
    const suggestedName = exportDocumentFileName(fileName);
    const targetPath = await save({
      defaultPath: suggestedName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (!targetPath) {
      return { status: "canceled" };
    }

    await invoke("export_pdf_file", {
      path: targetPath,
      html,
    });

    const savedName = targetPath.split(/[/\\]/u).pop() ?? suggestedName;
    return {
      status: "success",
      fileName: savedName,
      savedPath: targetPath,
    };
  }

  const exportedName = exportDocumentFileName(fileName);
  await exportPdfViaBrowserPrint(html, exportedName);
  return { status: "success", fileName: exportedName };
}
