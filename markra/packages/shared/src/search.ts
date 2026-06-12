export type SearchRange = {
  from: number;
  to: number;
};

type SearchOptions = {
  caseSensitive?: boolean;
};

export function findSearchRanges(text: string, query: string, options: SearchOptions = {}): SearchRange[] {
  if (!query) return [];

  const ranges: SearchRange[] = [];
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  let from = 0;

  while (from <= text.length - query.length) {
    const candidate = text.slice(from, from + query.length);
    const matches = options.caseSensitive
      ? candidate === query
      : candidate.toLocaleLowerCase() === needle;

    if (matches) {
      ranges.push({
        from,
        to: from + query.length
      });
      from += Math.max(1, query.length);
      continue;
    }

    from += 1;
  }

  return ranges;
}

export function normalizeSearchIndex(index: number, count: number) {
  if (count <= 0) return -1;

  return ((index % count) + count) % count;
}
