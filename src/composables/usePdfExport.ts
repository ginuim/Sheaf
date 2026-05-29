import { renderMarkdown } from "./useMarkdown";

const PRINT_CSS = `
  @media print {
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    body > *:not(#__blank-print-root) {
      display: none !important;
    }

    #__blank-print-root {
      display: block !important;
    }
  }

  #__blank-print-root {
    display: none;
    font-family: "Source Serif 4", "Songti SC", "STSong", "SimSun", Georgia, serif;
    font-size: 17px;
    line-height: 1.85;
    color: #2a2520;
    background: #ffffff;
    padding: 2.5rem 3rem 4rem;
    max-width: 42rem;
    margin: 0 auto;
    box-sizing: border-box;
  }

  #__blank-print-root * {
    box-sizing: border-box;
  }

  #__blank-print-root > * + * { margin-top: 1.25em; }

  #__blank-print-root h1,
  #__blank-print-root h2,
  #__blank-print-root h3,
  #__blank-print-root h4 {
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.02em;
    color: #2a2520;
  }

  #__blank-print-root h1 {
    font-size: 2rem;
    margin-top: 0;
    padding-bottom: 0.4em;
    border-bottom: 1px solid rgba(42,37,32,0.14);
  }

  #__blank-print-root h2 { font-size: 1.5rem; margin-top: 2em; }
  #__blank-print-root h3 { font-size: 1.2rem; }
  #__blank-print-root p { margin: 0; }
  #__blank-print-root a { color: #3d5a4c; }
  #__blank-print-root ul, #__blank-print-root ol { padding-left: 1.5em; }
  #__blank-print-root li + li { margin-top: 0.35em; }

  #__blank-print-root blockquote {
    margin: 0;
    padding: 0.25em 0 0.25em 1.25em;
    border-left: 3px solid #c4b8a8;
    color: #8a8278;
    font-style: italic;
  }

  #__blank-print-root code {
    font-family: "IBM Plex Mono", "Menlo", monospace;
    font-size: 0.88em;
    background: rgba(42,37,32,0.06);
    padding: 0.15em 0.4em;
    border-radius: 4px;
  }

  #__blank-print-root pre {
    background: rgba(42,37,32,0.06);
    border-radius: 8px;
    padding: 1.25em 1.5em;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  #__blank-print-root pre code { background: none; padding: 0; font-size: 0.85em; }

  #__blank-print-root hr {
    border: none;
    border-top: 1px solid rgba(42,37,32,0.14);
    margin: 2em 0;
  }

  #__blank-print-root img { max-width: 100%; }

  #__blank-print-root table { width: 100%; border-collapse: collapse; font-size: 0.95em; }
  #__blank-print-root th,
  #__blank-print-root td {
    border: 1px solid rgba(42,37,32,0.14);
    padding: 0.5em 0.75em;
    text-align: left;
  }
  #__blank-print-root th { background: rgba(42,37,32,0.05); font-weight: 500; }
`;

let printStyle: HTMLStyleElement | null = null;
let printRoot: HTMLDivElement | null = null;

function ensurePrintNodes() {
  if (!printStyle) {
    printStyle = document.createElement("style");
    printStyle.id = "__blank-print-style";
    document.head.appendChild(printStyle);
  }
  printStyle.textContent = PRINT_CSS;

  if (!printRoot) {
    printRoot = document.createElement("div");
    printRoot.id = "__blank-print-root";
    document.body.appendChild(printRoot);
  }
}

export async function exportPdf(
  source: string,
  _fileName: string,
  docFilePath: string | null = null,
) {
  ensurePrintNodes();
  printRoot!.innerHTML = renderMarkdown(source, docFilePath);

  await document.fonts.ready;

  window.print();
}
