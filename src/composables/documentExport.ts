import katexStyles from "katex/dist/katex.css?raw";

const defaultPdfMarginMm = 18;
const defaultPdfPageHeightMm = 297;
const defaultPdfPageWidthMm = 210;

export type MarkdownExportStyleOptions = {
  pdfHeightMm?: number;
  pdfMarginMm?: number;
  pdfPageBreakOnH1?: boolean;
  pdfWidthMm?: number;
};

function normalizePdfMarginMm(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultPdfMarginMm;

  return Math.min(Math.max(Math.round(value), 0), 60);
}

function normalizePdfPageDimensionMm(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(Math.max(Math.round(value), 50), 2000);
}

export function createMarkdownExportStyles({
  pdfHeightMm,
  pdfMarginMm,
  pdfPageBreakOnH1,
  pdfWidthMm,
}: MarkdownExportStyleOptions = {}) {
  const pageMarginMm = normalizePdfMarginMm(pdfMarginMm);
  const pageHeightMm = normalizePdfPageDimensionMm(pdfHeightMm, defaultPdfPageHeightMm);
  const pageWidthMm = normalizePdfPageDimensionMm(pdfWidthMm, defaultPdfPageWidthMm);
  const pageBreakStyles = pdfPageBreakOnH1
    ? `

  .markdown-export h1 {
    break-before: page;
  }

  .markdown-export h1:first-child {
    break-before: auto;
  }`
    : "";

  return `
${katexStyles}

:root {
  color: #2a2520;
  background: #fff;
}

body {
  margin: 0;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.markdown-export {
  box-sizing: border-box;
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 56px;
  font-family: "Source Serif 4", "Songti SC", "STSong", "SimSun", Georgia, serif;
  font-size: 17px;
  line-height: 1.85;
  color: #2a2520;
}

.markdown-export * {
  box-sizing: border-box;
}

.markdown-export > * + * {
  margin-top: 1.25em;
}

.markdown-export h1,
.markdown-export h2,
.markdown-export h3,
.markdown-export h4 {
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #2a2520;
  margin-bottom: 0.8em;
}

.markdown-export h1 {
  font-size: 2rem;
  margin-top: 0;
  padding-bottom: 0.4em;
  border-bottom: 1px solid rgba(42, 37, 32, 0.14);
}

.markdown-export h1 + p {
  margin-top: 1.5em;
}

.markdown-export h2 {
  font-size: 1.5rem;
  margin-top: 2em;
}

.markdown-export h3 {
  font-size: 1.2rem;
}

.markdown-export p {
  margin: 0;
}

.markdown-export p + p {
  margin-top: 1.45em;
}

.markdown-export a {
  color: #3d5a4c;
}

.markdown-export ul,
.markdown-export ol {
  padding-left: 1.5em;
}

.markdown-export li + li {
  margin-top: 0.35em;
}

.markdown-export blockquote {
  margin: 0;
  padding: 0.25em 0 0.25em 1.25em;
  border-left: 3px solid #c4b8a8;
  color: #8a8278;
  font-style: italic;
}

.markdown-export blockquote + p {
  margin-top: 1.45em;
}

.markdown-export code {
  font-family: "IBM Plex Mono", "Menlo", monospace;
  font-size: 0.88em;
  background: rgba(42, 37, 32, 0.06);
  padding: 0.15em 0.4em;
  border-radius: 4px;
}

.markdown-export pre {
  background: rgba(42, 37, 32, 0.06);
  border-radius: 8px;
  padding: 1.25em 1.5em;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.markdown-export pre code {
  background: none;
  padding: 0;
  font-size: 0.85em;
}

.markdown-export hr {
  border: none;
  border-top: 1px solid rgba(42, 37, 32, 0.14);
  margin: 2em 0;
}

.markdown-export img {
  max-width: 100%;
  height: auto;
}

.markdown-export .math-block {
  margin: 1.25em 0;
  text-align: center;
  overflow: visible;
}

.markdown-export .math-block .katex-display {
  margin: 0;
  overflow: visible;
}

.markdown-export .mermaid {
  margin: 1.5em 0;
  overflow-x: auto;
  text-align: center;
}

.markdown-export .mermaid svg {
  max-width: 100%;
  height: auto;
}

.markdown-export table {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  font-size: 0.95em;
}

.markdown-export th,
.markdown-export td {
  border: 1px solid rgba(42, 37, 32, 0.14);
  padding: 0.5em 0.75em;
  text-align: left;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markdown-export th {
  background: rgba(42, 37, 32, 0.05);
  font-weight: 500;
}

@media print {
  .markdown-export {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .markdown-export h1,
  .markdown-export h2,
  .markdown-export h3,
  .markdown-export h4 {
    break-after: avoid-page;
    page-break-after: avoid;
  }

  .markdown-export pre,
  .markdown-export table,
  .markdown-export blockquote,
  .markdown-export .math-block,
  .markdown-export .mermaid {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .markdown-export tr,
  .markdown-export img,
  .markdown-export svg {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .markdown-export thead {
    display: table-header-group;
  }

  .markdown-export pre,
  .markdown-export pre code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }${pageBreakStyles}
}

@page {
  size: ${pageWidthMm}mm ${pageHeightMm}mm;
  margin: ${pageMarginMm}mm;
}
`.trim();
}

type BuildMarkdownHtmlDocumentInput = {
  bodyHtml: string;
  language?: string;
  pdfHeightMm?: number;
  pdfMarginMm?: number;
  pdfPageBreakOnH1?: boolean;
  pdfWidthMm?: number;
  styles?: string;
  title: string;
};

function escapeHtmlText(text: string) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function exportDocumentFileName(documentName: string) {
  const trimmedName = documentName.trim();
  const baseName = (trimmedName || "Untitled")
    .replace(/\.(?:md|markdown|txt)$/iu, "")
    .trim() || "Untitled";

  return `${baseName}.pdf`;
}

export function buildMarkdownHtmlDocument({
  bodyHtml,
  language = "zh-CN",
  pdfHeightMm,
  pdfMarginMm,
  pdfPageBreakOnH1,
  pdfWidthMm,
  styles,
  title,
}: BuildMarkdownHtmlDocumentInput) {
  const escapedTitle = escapeHtmlText(title.trim() || "Untitled");
  const escapedLanguage = escapeHtmlText(language.trim() || "zh-CN");
  const documentStyles = styles ?? createMarkdownExportStyles({
    pdfHeightMm,
    pdfMarginMm,
    pdfPageBreakOnH1,
    pdfWidthMm,
  });

  return [
    "<!doctype html>",
    `<html lang="${escapedLanguage}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapedTitle}</title>`,
    "<style>",
    documentStyles,
    "</style>",
    "</head>",
    "<body>",
    '<main class="markdown-export">',
    bodyHtml,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}
