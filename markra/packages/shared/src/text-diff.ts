export type DiffLineType = "added" | "ellipsis" | "normal" | "removed";

export type DiffLine = {
  text: string;
  type: Exclude<DiffLineType, "ellipsis">;
};

export type CompressedDiffLine = {
  text: string;
  type: DiffLineType;
};

export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  if (m * n > 1_000_000) {
    const result: DiffLine[] = [];
    for (const line of oldLines) {
      result.push({ type: "removed", text: line });
    }
    for (const line of newLines) {
      result.push({ type: "added", text: line });
    }
    return result;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "normal", text: oldLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: newLines[j - 1] });
      j -= 1;
    } else {
      result.unshift({ type: "removed", text: oldLines[i - 1] });
      i -= 1;
    }
  }

  return result;
}

export function compressDiff(lines: DiffLine[], contextLines = 2): CompressedDiffLine[] {
  const result: CompressedDiffLine[] = [];
  const n = lines.length;
  const shouldShow = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i += 1) {
    if (lines[i].type === "added" || lines[i].type === "removed") {
      shouldShow[i] = true;
      for (let j = 1; j <= contextLines; j += 1) {
        if (i - j >= 0) shouldShow[i - j] = true;
        if (i + j < n) shouldShow[i + j] = true;
      }
    }
  }

  let inEllipsis = false;
  for (let i = 0; i < n; i += 1) {
    if (shouldShow[i]) {
      inEllipsis = false;
      result.push({
        type: lines[i].type,
        text: lines[i].text
      });
    } else if (!inEllipsis) {
      let count = 0;
      for (let k = i; k < n; k += 1) {
        if (!shouldShow[k]) count += 1;
        else break;
      }
      result.push({
        type: "ellipsis",
        text: `... ${count} unchanged lines ...`
      });
      inEllipsis = true;
    }
  }

  return result;
}

export function summarizeDiffLines(lines: DiffLine[]) {
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (line.type === "added") added += 1;
    if (line.type === "removed") removed += 1;
  }

  return { added, removed };
}
