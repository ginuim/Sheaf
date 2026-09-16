const LANG_LABEL: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  sh: "bash",
  bash: "bash",
  zsh: "zsh",
  shell: "shell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sql: "SQL",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  swift: "Swift",
  vue: "Vue",
  md: "Markdown",
  markdown: "Markdown",
  toml: "TOML",
  xml: "XML",
  text: "",
  plaintext: "",
  txt: "",
};

const KEYWORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "async",
  "await",
  "from",
  "as",
  "of",
  "type",
  "readonly",
  "undefined",
  "null",
  "true",
  "false",
  "def",
  "lambda",
  "pass",
  "None",
  "True",
  "False",
  "and",
  "or",
  "not",
  "elif",
  "raise",
  "except",
  "global",
  "nonlocal",
  "assert",
  "fn",
  "mut",
  "pub",
  "impl",
  "struct",
  "trait",
  "match",
  "mod",
  "use",
  "where",
  "crate",
  "self",
  "Self",
  "ref",
  "move",
  "unsafe",
  "dyn",
  "func",
  "defer",
  "go",
  "chan",
  "select",
  "range",
  "nil",
  "map",
  "make",
  "fallthrough",
]);

const COLOR = {
  keyword: "#ff7ab2",
  string: "#ff8170",
  comment: "#6c7b88",
  number: "#d9c97c",
  function: "#67b7ff",
} as const;

const TABLE_RESET =
  "border:0;border-collapse:collapse;width:100%;margin:0;padding:0;background:transparent;";
const CELL_RESET =
  "border:0;padding:0;margin:0;background:transparent;vertical-align:middle;";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 公众号会折叠 span 旁的普通空格，缩进必须写成 nbsp。 */
function encodeCodeText(text: string): string {
  return escapeHtml(text)
    .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
    .replace(/ /g, "&nbsp;");
}

function colored(text: string, color: string): string {
  return `<span style="color:${color};white-space:pre;letter-spacing:0">${encodeCodeText(text)}</span>`;
}

function fenceLanguage(pre: HTMLElement): string {
  const code = pre.querySelector("code");
  const cls = code?.getAttribute("class") ?? "";
  const match = cls.match(/language-([a-zA-Z0-9+#._-]+)/);
  return match?.[1] ?? "";
}

function languageLabel(raw: string): string {
  const key = raw.toLowerCase();
  if (key in LANG_LABEL) return LANG_LABEL[key];
  if (/^[a-z0-9+#._-]{1,24}$/i.test(raw)) return raw;
  return "";
}

type CommentKind = "c" | "hash" | "html" | "sql" | "css";

function commentKind(lang: string): CommentKind {
  switch (lang.toLowerCase()) {
    case "py":
    case "python":
    case "rb":
    case "ruby":
    case "sh":
    case "bash":
    case "zsh":
    case "shell":
    case "yaml":
    case "yml":
    case "toml":
    case "r":
    case "dockerfile":
      return "hash";
    case "html":
    case "xml":
    case "svg":
      return "html";
    case "sql":
      return "sql";
    case "css":
      return "css";
    default:
      return "c";
  }
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function readUntil(
  src: string,
  start: number,
  pred: (i: number) => boolean,
): number {
  let i = start;
  while (i < src.length && !pred(i)) i += 1;
  return i;
}

function highlightSource(source: string, lang: string): string {
  const kind = commentKind(lang);
  const highlightWords =
    lang !== "" && lang !== "text" && lang !== "plaintext" && lang !== "txt";
  const out: string[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    if (kind === "c" && source.startsWith("//", i)) {
      const end = readUntil(source, i, (j) => source[j] === "\n");
      out.push(colored(source.slice(i, end), COLOR.comment));
      i = end;
      continue;
    }
    if (
      (kind === "c" || kind === "css" || kind === "sql") &&
      source.startsWith("/*", i)
    ) {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      out.push(colored(source.slice(i, end), COLOR.comment));
      i = end;
      continue;
    }
    if (kind === "hash" && source[i] === "#") {
      const end = readUntil(source, i, (j) => source[j] === "\n");
      out.push(colored(source.slice(i, end), COLOR.comment));
      i = end;
      continue;
    }
    if (kind === "html" && source.startsWith("<!--", i)) {
      const close = source.indexOf("-->", i + 4);
      const end = close === -1 ? n : close + 3;
      out.push(colored(source.slice(i, end), COLOR.comment));
      i = end;
      continue;
    }
    if (kind === "sql" && source.startsWith("--", i)) {
      const end = readUntil(source, i, (j) => source[j] === "\n");
      out.push(colored(source.slice(i, end), COLOR.comment));
      i = end;
      continue;
    }

    if (kind === "hash" && source.startsWith('"""', i)) {
      const close = source.indexOf('"""', i + 3);
      const end = close === -1 ? n : close + 3;
      out.push(colored(source.slice(i, end), COLOR.string));
      i = end;
      continue;
    }
    if (kind === "hash" && source.startsWith("'''", i)) {
      const close = source.indexOf("'''", i + 3);
      const end = close === -1 ? n : close + 3;
      out.push(colored(source.slice(i, end), COLOR.string));
      i = end;
      continue;
    }

    const quote = source[i];
    if (quote === '"' || quote === "'" || (quote === "`" && kind === "c")) {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(colored(source.slice(i, j), COLOR.string));
      i = j;
      continue;
    }

    if (
      /[0-9]/.test(source[i] ?? "") &&
      (i === 0 || !isIdentPart(source[i - 1] ?? ""))
    ) {
      let j = i;
      while (j < n && /[0-9_.]/.test(source[j] ?? "")) j += 1;
      out.push(colored(source.slice(i, j), COLOR.number));
      i = j;
      continue;
    }

    if (highlightWords && isIdentStart(source[i] ?? "")) {
      let j = i + 1;
      while (j < n && isIdentPart(source[j] ?? "")) j += 1;
      const ident = source.slice(i, j);
      let k = j;
      while (k < n && (source[k] === " " || source[k] === "\t")) k += 1;
      out.push(
        KEYWORDS.has(ident)
          ? colored(ident, COLOR.keyword)
          : source[k] === "("
            ? colored(ident, COLOR.function)
            : encodeCodeText(ident),
      );
      i = j;
      continue;
    }

    out.push(encodeCodeText(source[i] ?? ""));
    i += 1;
  }

  return out.join("");
}

const CODE_LINE_STYLE =
  "margin:0;padding:0;white-space:pre;letter-spacing:0;word-break:normal;overflow-wrap:break-word;font-family:inherit;font-size:inherit;line-height:inherit;color:inherit;";

function toWechatCodeHtml(source: string, lang: string): string {
  let text = source.replace(/\r\n/g, "\n");
  if (text.endsWith("\n")) text = text.slice(0, -1);
  const huge = source.length > 80_000;
  return text
    .split("\n")
    .map((line) => {
      const inner =
        line.length === 0
          ? "&nbsp;"
          : huge
            ? encodeCodeText(line)
            : highlightSource(line, lang);
      return `<p style="${CODE_LINE_STYLE}">${inner}</p>`;
    })
    .join("");
}

function createDot(style: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.setAttribute("style", style);
  el.innerHTML = "&nbsp;";
  return el;
}

function appendDots(target: HTMLElement, styles: Record<string, string>) {
  target.append(
    createDot(styles.terminalDotRed),
    createDot(styles.terminalDotYellow),
    createDot(styles.terminalDotGreen),
  );
}

function createCell(extraStyle = ""): HTMLTableCellElement {
  const td = document.createElement("td");
  td.setAttribute("style", `${CELL_RESET}${extraStyle}`);
  return td;
}

function buildTitlebar(
  styles: Record<string, string>,
  label: string,
): HTMLElement {
  const bar = document.createElement("section");
  bar.setAttribute("style", styles.terminalTitlebar);
  if (!label) {
    appendDots(bar, styles);
    return bar;
  }

  const table = document.createElement("table");
  table.setAttribute("cellpadding", "0");
  table.setAttribute("cellspacing", "0");
  table.setAttribute("style", TABLE_RESET);
  const row = table.createTBody().insertRow();

  const dotsCell = createCell("width:72px;");
  appendDots(dotsCell, styles);
  const langCell = createCell(styles.terminalLang);
  langCell.textContent = label;
  const spacer = createCell("width:72px;");
  spacer.innerHTML = "&nbsp;";

  row.append(dotsCell, langCell, spacer);
  bar.appendChild(table);
  return bar;
}

function wrapPre(pre: HTMLElement, styles: Record<string, string>, lang: string) {
  const source = (pre.querySelector("code") ?? pre).textContent ?? "";
  const frame = document.createElement("section");
  frame.setAttribute("style", styles.terminalWindow);
  frame.setAttribute("data-sheaf-code-frame", "mac-terminal");
  frame.appendChild(buildTitlebar(styles, languageLabel(lang)));

  const body = document.createElement("section");
  body.setAttribute("style", styles.terminalBody);
  body.setAttribute("data-sheaf-code-body", "");
  body.innerHTML = toWechatCodeHtml(source, lang);
  frame.appendChild(body);

  pre.replaceWith(frame);
}

function shouldSkipPre(pre: HTMLElement): boolean {
  if (pre.classList.contains("math-block-error")) return true;
  if (pre.closest("[data-sheaf-code-frame]")) return true;
  if (pre.closest(".mermaid, .katex, .katex-display, .math-block")) return true;
  return false;
}

/** 把代码块包成 macOS Terminal 窗口，并做轻量语法着色 */
export function applyMacTerminalCodeFrames(
  root: HTMLElement,
  styles: Record<string, string>,
) {
  if (!styles.terminalWindow || !styles.terminalBody) return;
  root.querySelectorAll("pre").forEach((pre) => {
    if (shouldSkipPre(pre)) return;
    wrapPre(pre, styles, fenceLanguage(pre));
  });
}
