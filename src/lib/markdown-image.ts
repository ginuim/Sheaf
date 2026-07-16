export type MarkdownImageMatch = {
  from: number;
  to: number;
  alt: string;
  src: string;
  line: number;
};

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function lineNumberAt(source: string, index: number): number {
  let line = 0;
  for (let cursor = 0; cursor < index && cursor < source.length; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}

export function findImagesInSource(source: string): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];
  IMAGE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = IMAGE_PATTERN.exec(source)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    matches.push({
      from,
      to,
      alt: match[1] ?? "",
      src: match[2] ?? "",
      line: lineNumberAt(source, from),
    });
  }

  return matches;
}

export function findImageAtLine(source: string, line: number): MarkdownImageMatch | null {
  return findImagesInSource(source).find((item) => item.line === line) ?? null;
}

export function findImageBySrc(source: string, src: string): MarkdownImageMatch | null {
  return findImagesInSource(source).find((item) => item.src === src) ?? null;
}

export function replaceImageSrc(
  source: string,
  match: MarkdownImageMatch,
  nextSrc: string,
): string {
  const nextMarkdown = `![${match.alt}](${nextSrc})`;
  return `${source.slice(0, match.from)}${nextMarkdown}${source.slice(match.to)}`;
}
