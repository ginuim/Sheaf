export const defaultReadLineLimit = 400;
export const defaultGrepMaxMatches = 50;

export function splitLines(text: string): string[] {
  return text.split("\n");
}

export function findOccurrences(text: string, search: string): number[] {
  if (!search) return [];

  const indexes: number[] = [];
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(search, from);
    if (index === -1) break;
    indexes.push(index);
    from = index + search.length;
  }
  return indexes;
}

export type ReadSlice = {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
};

export function readLines(
  text: string,
  offset = 1,
  limit = defaultReadLineLimit,
): ReadSlice {
  const lines = splitLines(text);
  const totalLines = lines.length;
  if (totalLines === 0) {
    return { content: "", startLine: 1, endLine: 0, totalLines: 0, truncated: false };
  }

  const startLine = Math.min(Math.max(Math.trunc(offset) || 1, 1), totalLines);
  const take = Math.max(Math.trunc(limit) || defaultReadLineLimit, 1);
  const slice = lines.slice(startLine - 1, startLine - 1 + take);
  const endLine = startLine + slice.length - 1;
  const truncated = endLine < totalLines;
  const width = Math.max(String(endLine).length, 4);

  return {
    content: slice
      .map((line, index) => `${String(startLine + index).padStart(width, " ")}|${line}`)
      .join("\n"),
    startLine,
    endLine,
    totalLines,
    truncated,
  };
}

export type GrepMatch = {
  line: number;
  text: string;
};

export type GrepResult =
  | { ok: true; matches: GrepMatch[]; matchCount: number; truncated: boolean }
  | { ok: false; error: string };

export function grepLines(
  text: string,
  pattern: string,
  options?: {
    caseInsensitive?: boolean;
    maxMatches?: number;
    regex?: boolean;
  },
): GrepResult {
  const trimmed = pattern;
  if (!trimmed) return { ok: false, error: "pattern 不能为空" };

  const maxMatches = options?.maxMatches ?? defaultGrepMaxMatches;
  const lines = splitLines(text);
  const matches: GrepMatch[] = [];
  let matchCount = 0;

  let testLine: (line: string) => boolean;
  if (options?.regex) {
    try {
      const flags = options.caseInsensitive ? "i" : "";
      const regex = new RegExp(trimmed, flags);
      testLine = (line) => {
        regex.lastIndex = 0;
        return regex.test(line);
      };
    } catch {
      return { ok: false, error: `无效正则: ${trimmed}` };
    }
  } else {
    const needle = options?.caseInsensitive ? trimmed.toLowerCase() : trimmed;
    testLine = (line) => {
      const haystack = options?.caseInsensitive ? line.toLowerCase() : line;
      return haystack.includes(needle);
    };
  }

  for (let index = 0; index < lines.length; index++) {
    if (!testLine(lines[index])) continue;
    matchCount += 1;
    if (matches.length < maxMatches) {
      matches.push({ line: index + 1, text: lines[index] });
    }
  }

  return {
    ok: true,
    matches,
    matchCount,
    truncated: matchCount > matches.length,
  };
}

export function formatGrepContent(path: string, matches: GrepMatch[]): string {
  if (matches.length === 0) return `${path}: 无匹配`;
  const width = String(matches[matches.length - 1]?.line ?? 1).length;
  return [
    path,
    ...matches.map((match) => `${String(match.line).padStart(width, " ")}:${match.text}`),
  ].join("\n");
}

export type UniqueReplaceResult =
  | { ok: true; next: string; count: number }
  | { ok: false; error: string };

export function applyUniqueReplace(
  text: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): UniqueReplaceResult {
  if (!oldString) return { ok: false, error: "old_string 不能为空" };
  if (oldString === newString) {
    return { ok: false, error: "old_string 与 new_string 相同" };
  }

  const indexes = findOccurrences(text, oldString);
  if (indexes.length === 0) {
    return { ok: false, error: "未找到 old_string。请先 grep 或 read，确保原文与文档完全一致（含空格和换行）" };
  }
  if (indexes.length > 1 && !replaceAll) {
    return {
      ok: false,
      error: `old_string 出现 ${indexes.length} 次。扩大上下文使其唯一，或设 replace_all=true`,
    };
  }

  if (replaceAll) {
    return {
      ok: true,
      next: text.split(oldString).join(newString),
      count: indexes.length,
    };
  }

  const index = indexes[0];
  return {
    ok: true,
    next: `${text.slice(0, index)}${newString}${text.slice(index + oldString.length)}`,
    count: 1,
  };
}
