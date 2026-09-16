export const SEARCH_HIT_CLASS = "preview-search-hit";
export const SEARCH_HIT_ACTIVE_CLASS = "preview-search-hit-active";

const SKIP_SELECTOR = "script, style, svg, noscript, .mermaid, .katex";

type TextPiece = {
  node: Text;
  start: number;
  length: number;
};

export function clearSearchHits(root: HTMLElement) {
  const hits = [...root.querySelectorAll(`mark.${SEARCH_HIT_CLASS}`)];
  for (const hit of hits) {
    const parent = hit.parentNode;
    if (!parent) continue;
    while (hit.firstChild) parent.insertBefore(hit.firstChild, hit);
    parent.removeChild(hit);
    parent.normalize();
  }
}

function collectPieces(root: HTMLElement): TextPiece[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.nodeValue;
      if (!value) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const pieces: TextPiece[] = [];
  let start = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    const node = current as Text;
    const length = node.nodeValue?.length ?? 0;
    pieces.push({ node, start, length });
    start += length;
    current = walker.nextNode();
  }
  return pieces;
}

function findMatchRanges(
  concat: string,
  query: string,
  caseSensitive: boolean,
): Array<{ from: number; to: number }> {
  if (!query) return [];
  const ranges: Array<{ from: number; to: number }> = [];
  const haystack = caseSensitive ? concat : concat.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    ranges.push({ from: index, to: index + needle.length });
    from = index + Math.max(needle.length, 1);
  }
  return ranges;
}

function wrapTextSlice(
  node: Text,
  from: number,
  to: number,
  matchIndex: number,
): HTMLElement | null {
  if (!node.parentNode || !node.nodeValue) return null;
  const length = node.nodeValue.length;
  const start = Math.max(0, Math.min(from, length));
  const end = Math.max(start, Math.min(to, length));
  if (start >= end) return null;
  if (end < length) node.splitText(end);
  const target = start > 0 ? node.splitText(start) : node;
  const mark = document.createElement("mark");
  mark.className = SEARCH_HIT_CLASS;
  mark.dataset.matchIndex = String(matchIndex);
  target.parentNode!.insertBefore(mark, target);
  mark.appendChild(target);
  return mark;
}

/** 从后往前包一层 mark。同一节点里的多个命中不会把更早的偏移量打乱。 */
export function applySearchHits(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): HTMLElement[][] {
  clearSearchHits(root);
  if (!query) return [];

  const pieces = collectPieces(root);
  if (pieces.length === 0) return [];

  const concat = pieces.map((piece) => piece.node.nodeValue ?? "").join("");
  const ranges = findMatchRanges(concat, query, caseSensitive);
  const groups: HTMLElement[][] = ranges.map(() => []);

  for (let rangeIndex = ranges.length - 1; rangeIndex >= 0; rangeIndex--) {
    const range = ranges[rangeIndex]!;
    const overlapping = pieces.filter(
      (piece) => piece.start < range.to && piece.start + piece.length > range.from,
    );
    for (let pieceIndex = overlapping.length - 1; pieceIndex >= 0; pieceIndex--) {
      const piece = overlapping[pieceIndex]!;
      const localFrom = Math.max(0, range.from - piece.start);
      const localTo = Math.min(piece.length, range.to - piece.start);
      const mark = wrapTextSlice(piece.node, localFrom, localTo, rangeIndex);
      if (mark) groups[rangeIndex]!.unshift(mark);
    }
  }

  return groups;
}

export function setActiveSearchHit(groups: HTMLElement[][], activeIndex: number) {
  for (let index = 0; index < groups.length; index++) {
    const active = index === activeIndex;
    for (const mark of groups[index]!) {
      mark.classList.toggle(SEARCH_HIT_ACTIVE_CLASS, active);
    }
  }
}
