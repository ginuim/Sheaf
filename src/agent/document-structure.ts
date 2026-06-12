export type DocumentAnchorKind =
  | "block"
  | "document"
  | "document_end"
  | "heading"
  | "section"
  | "table";

export type DocumentAnchor = {
  id: string;
  kind: DocumentAnchorKind;
  from: number;
  to: number;
  title: string;
  level?: number;
  text?: string;
};

type MarkdownLine = {
  index: number;
  from: number;
  to: number;
  text: string;
};

const maxAnchorTextChars = 2_000;

export function getMarkdownLines(doc: string): MarkdownLine[] {
  const lines = doc.split("\n");
  const result: MarkdownLine[] = [];
  let offset = 0;

  lines.forEach((text, index) => {
    const to = offset + text.length;
    result.push({ index, from: offset, to, text });
    offset = to + (index < lines.length - 1 ? 1 : 0);
  });

  return result;
}

export function buildDocumentAnchors(doc: string): DocumentAnchor[] {
  const lines = getMarkdownLines(doc);
  return [
    {
      id: "whole-document",
      kind: "document",
      from: 0,
      to: doc.length,
      title: "全文",
    },
    ...buildHeadingAndSectionAnchors(doc, lines),
    ...buildTableAnchors(doc, lines),
    ...buildBlockAnchors(doc, lines),
    {
      id: "document-end",
      kind: "document_end",
      from: doc.length,
      to: doc.length,
      title: "文档末尾",
    },
  ];
}

export function findAnchor(doc: string, anchorId: string): DocumentAnchor | null {
  const id = anchorId.trim();
  if (!id) return null;
  return buildDocumentAnchors(doc).find((anchor) => anchor.id === id) ?? null;
}

export function findSectionByHeading(doc: string, headingTitle: string): DocumentAnchor | null {
  const target = normalizeText(headingTitle);
  if (!target) return null;

  const anchors = buildDocumentAnchors(doc);
  const matchesTitle = (anchor: DocumentAnchor) => {
    const title = normalizeText(anchor.title);
    return title === target || title.includes(target) || target.includes(title);
  };

  return (
    anchors.find((anchor) => anchor.kind === "section" && matchesTitle(anchor)) ??
    anchors.find((anchor) => anchor.kind === "heading" && matchesTitle(anchor)) ??
    null
  );
}

export function locateAnchors(
  doc: string,
  query: string,
  kinds?: DocumentAnchorKind[],
): DocumentAnchor[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];
  const allowed = kinds?.length ? new Set(kinds) : null;

  return buildDocumentAnchors(doc)
    .filter((anchor) => {
      if (anchor.kind === "document" || anchor.kind === "document_end") return false;
      if (allowed && !allowed.has(anchor.kind)) return false;
      const title = normalizeText(anchor.title);
      const text = normalizeText(anchor.text ?? doc.slice(anchor.from, anchor.to));
      return (
        title.includes(normalizedQuery) ||
        normalizedQuery.includes(title) ||
        text.includes(normalizedQuery)
      );
    })
    .slice(0, 12);
}

export function findExactTextRange(doc: string, exactText: string) {
  const candidates = [
    exactText,
    exactText.replace(/\r\n/g, "\n"),
    exactText.trimEnd(),
    exactText.trim(),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const index = doc.indexOf(candidate);
    if (index >= 0) {
      return { from: index, to: index + candidate.length, original: candidate };
    }
  }

  return null;
}

export function formatAnchorList(doc: string, anchors = buildDocumentAnchors(doc)) {
  return anchors
    .map((anchor) => {
      const level = anchor.level ? ` h${anchor.level}` : "";
      const excerpt = summarizeText(anchor.text ?? doc.slice(anchor.from, anchor.to), 90);
      return [
        `- ${anchor.id} [${anchor.kind}${level}] ${anchor.from}-${anchor.to}: ${anchor.title}`,
        excerpt ? `  ${excerpt}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function summarizeText(text: string, max = 120) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (!singleLine) return "";
  return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

export function normalizeInsertedContent(doc: string, position: number, content: string) {
  const bounded = Math.max(0, Math.min(position, doc.length));
  const trimmedRight = content.replace(/\s+$/g, "");
  const prefix =
    bounded === 0
      ? ""
      : doc[bounded - 1] === "\n"
        ? ""
        : "\n\n";
  const suffix =
    bounded >= doc.length || doc[bounded] === "\n" || trimmedRight.endsWith("\n")
      ? ""
      : "\n\n";

  return `${prefix}${trimmedRight}${suffix}`;
}

function buildHeadingAndSectionAnchors(doc: string, lines: MarkdownLine[]) {
  const headingLines = lines
    .map((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.text);
      if (!match) return null;
      return {
        line,
        level: match[1].length,
        title: match[2].trim(),
      };
    })
    .filter((heading): heading is NonNullable<typeof heading> => heading !== null);

  const anchors: DocumentAnchor[] = [];

  headingLines.forEach((heading, index) => {
    anchors.push({
      id: `heading:${index + 1}`,
      kind: "heading",
      from: heading.line.from,
      to: heading.line.to,
      title: heading.title,
      level: heading.level,
      text: heading.line.text,
    });

    const nextSameOrHigher = headingLines
      .slice(index + 1)
      .find((candidate) => candidate.level <= heading.level);
    const sectionTo = nextSameOrHigher?.line.from ?? doc.length;
    const text = doc.slice(heading.line.from, sectionTo);
    anchors.push({
      id: `section:${index + 1}`,
      kind: "section",
      from: heading.line.from,
      to: sectionTo,
      title: heading.title,
      level: heading.level,
      text: trimAnchorText(text),
    });
  });

  return anchors;
}

function buildTableAnchors(doc: string, lines: MarkdownLine[]) {
  const anchors: DocumentAnchor[] = [];
  let tableStart: MarkdownLine | null = null;
  let previous: MarkdownLine | null = null;

  const pushTable = () => {
    if (!tableStart || !previous || previous.index <= tableStart.index) {
      tableStart = null;
      previous = null;
      return;
    }
    const from = tableStart.from;
    const to = previous.to;
    anchors.push({
      id: `table:${anchors.length + 1}`,
      kind: "table",
      from,
      to,
      title: summarizeText(tableStart.text, 56) || `表格 ${anchors.length + 1}`,
      text: trimAnchorText(doc.slice(from, to)),
    });
    tableStart = null;
    previous = null;
  };

  for (const line of lines) {
    if (looksLikeTableLine(line.text)) {
      tableStart ??= line;
      previous = line;
      continue;
    }
    pushTable();
  }
  pushTable();

  return anchors;
}

function buildBlockAnchors(doc: string, lines: MarkdownLine[]) {
  const anchors: DocumentAnchor[] = [];
  let start: MarkdownLine | null = null;
  let end: MarkdownLine | null = null;

  const pushBlock = () => {
    if (!start || !end) {
      start = null;
      end = null;
      return;
    }

    const text = doc.slice(start.from, end.to);
    if (text.trim()) {
      anchors.push({
        id: `block:${anchors.length + 1}`,
        kind: "block",
        from: start.from,
        to: end.to,
        title: summarizeText(text, 56) || `段落 ${anchors.length + 1}`,
        text: trimAnchorText(text),
      });
    }
    start = null;
    end = null;
  };

  for (const line of lines) {
    if (!line.text.trim()) {
      pushBlock();
      continue;
    }
    start ??= line;
    end = line;
  }
  pushBlock();

  return anchors;
}

function looksLikeTableLine(text: string) {
  const trimmed = text.trim();
  if (!trimmed.includes("|")) return false;
  return /^\|?.+\|.+\|?$/.test(trimmed);
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function trimAnchorText(text: string) {
  return text.length > maxAnchorTextChars
    ? `${text.slice(0, maxAnchorTextChars)}\n\n[已截断]`
    : text;
}
