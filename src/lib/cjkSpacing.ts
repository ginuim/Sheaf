const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const ASCII_WORD_CHAR = /[A-Za-z0-9]/;

type MarkdownInlineToken = {
  type: string;
  content?: string;
  children?: MarkdownInlineToken[];
  nesting?: number;
};

type VisibleTextToken = {
  token: MarkdownInlineToken;
  context: string[];
};

const SKIP_VISIBLE_TYPES = new Set([
  "code_inline",
  "html_inline",
  "image",
  "math_inline",
]);

const PLACEHOLDER_BASE = 0xe000;

function isCjkChar(char: string | null | undefined): boolean {
  return char == null ? false : CJK_CHAR.test(char);
}

function isAsciiWordChar(char: string | null | undefined): boolean {
  return char == null ? false : ASCII_WORD_CHAR.test(char);
}

function formatTextContent(text: string): string {
  return text
    .replace(
      /([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af])([A-Za-z0-9])/g,
      "$1 $2",
    )
    .replace(
      /([A-Za-z0-9])([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af])/g,
      "$1 $2",
    );
}

function shouldFormatBoundary(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return (
    (isCjkChar(left) && isAsciiWordChar(right)) ||
    (isAsciiWordChar(left) && isCjkChar(right))
  );
}

function firstChar(text: string | undefined): string | null {
  return Array.from(text ?? "")[0] ?? null;
}

function lastChar(text: string | undefined): string | null {
  const chars = Array.from(text ?? "");
  return chars[chars.length - 1] ?? null;
}

function sameContext(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

export function applyChineseEnglishSpacingToText(text: string): string {
  return formatTextContent(text);
}

function protectMarkdownRanges(line: string): [string, string[]] {
  const protectedValues: string[] = [];
  const pattern = /(`+)([^`]*?)\1|(\]\([^)]*\))|(https?:\/\/[^\s)]+)|(<https?:\/\/[^>\s]+>)/g;

  const protectedLine = line.replace(pattern, (match) => {
    const placeholder = String.fromCharCode(PLACEHOLDER_BASE + protectedValues.length);
    protectedValues.push(match);
    return placeholder;
  });

  return [protectedLine, protectedValues];
}

function restoreMarkdownRanges(line: string, protectedValues: string[]): string {
  return protectedValues.reduce(
    (result, value, index) =>
      result.split(String.fromCharCode(PLACEHOLDER_BASE + index)).join(value),
    line,
  );
}

function formatMarkdownInlineSource(line: string): string {
  const [protectedLine, protectedValues] = protectMarkdownRanges(line);
  const formatted = formatTextContent(protectedLine)
    .replace(
      /([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af])([*_~]{1,3})([A-Za-z0-9])/g,
      "$1 $2$3",
    )
    .replace(
      /([A-Za-z0-9])([*_~]{1,3})([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af])/g,
      "$1$2 $3",
    )
    .replace(
      /([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af])(!?\[)/g,
      "$1 $2",
    );

  return restoreMarkdownRanges(formatted, protectedValues).replace(
    /(\[[^\]]*[A-Za-z0-9][^\]]*\]\([^)]*\))([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af])/g,
    "$1 $2",
  );
}

export function applyChineseEnglishSpacingToMarkdownSource(source: string): string {
  const parts = source.split(/(\r?\n)/);
  let fenceMarker: string | null = null;

  return parts
    .map((part) => {
      if (/^\r?\n$/.test(part)) return part;

      const fenceMatch = part.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!fenceMarker) {
          fenceMarker = marker;
        } else if (fenceMarker === marker) {
          fenceMarker = null;
        }
        return part;
      }

      if (fenceMarker) return part;
      return formatMarkdownInlineSource(part);
    })
    .join("");
}

function normalizeTextTokens(tokens: MarkdownInlineToken[] | undefined) {
  if (!tokens) return;

  for (const token of tokens) {
    if (token.type === "text" && token.content) {
      token.content = formatTextContent(token.content);
    }

    if (token.children?.length && !SKIP_VISIBLE_TYPES.has(token.type)) {
      normalizeTextTokens(token.children);
    }
  }
}

function collectVisibleTextTokens(
  tokens: MarkdownInlineToken[] | undefined,
  context: string[] = [],
): VisibleTextToken[] {
  if (!tokens) return [];

  const result: VisibleTextToken[] = [];
  const stack = [...context];

  for (const token of tokens) {
    if (SKIP_VISIBLE_TYPES.has(token.type)) continue;

    if (token.type === "text") {
      result.push({ token, context: [...stack] });
      continue;
    }

    if (token.nesting === 1) {
      stack.push(token.type);
      continue;
    }

    if (token.nesting === -1) {
      stack.pop();
      continue;
    }

    if (token.children?.length) {
      result.push(...collectVisibleTextTokens(token.children, stack));
    }
  }

  return result;
}

function appendSpace(left: VisibleTextToken, right: VisibleTextToken) {
  const leftChar = lastChar(left.token.content);
  const rightChar = firstChar(right.token.content);
  if (!shouldFormatBoundary(leftChar, rightChar)) return;

  if (!sameContext(left.context, right.context)) {
    if (left.context.length > right.context.length) {
      right.token.content = ` ${right.token.content ?? ""}`;
      return;
    }

    left.token.content = `${left.token.content ?? ""} `;
    return;
  }

  if (isCjkChar(leftChar) && isAsciiWordChar(rightChar)) {
    left.token.content = `${left.token.content ?? ""} `;
  } else {
    right.token.content = ` ${right.token.content ?? ""}`;
  }
}

export function applyChineseEnglishSpacingToMarkdownTokens(
  tokens: MarkdownInlineToken[] | undefined,
) {
  if (!tokens) return;

  normalizeTextTokens(tokens);

  const visibleTokens = collectVisibleTextTokens(tokens);
  for (let index = 0; index < visibleTokens.length - 1; index++) {
    appendSpace(visibleTokens[index], visibleTokens[index + 1]);
  }
}

export function shouldInsertCjkSpacing(left: string | null, right: string | null) {
  return shouldFormatBoundary(left, right);
}
