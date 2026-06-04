import type { EditChange } from "../composables/useAI";

export function buildAppendChange(doc: string, content: string, insertAt?: number): EditChange {
  const position = insertAt ?? doc.length;
  const bounded = Math.max(0, Math.min(position, doc.length));
  const needsLeadingBreak =
    bounded > 0 && bounded === doc.length
      ? !doc.endsWith("\n\n")
      : bounded > 0 && doc[bounded - 1] !== "\n";
  const prefix = bounded === 0 ? "" : needsLeadingBreak ? "\n\n" : bounded === doc.length && doc.endsWith("\n") ? "\n" : "";
  return {
    from: bounded,
    to: bounded,
    insert: `${prefix}${content}`,
  };
}

export function findInsertPointAfterHeading(doc: string, heading: string): number | null {
  const target = heading.trim();
  if (!target) return null;

  const lines = doc.split("\n");
  let offset = 0;
  let matchedLevel = 0;
  let matched = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();
      if (matched && level <= matchedLevel) {
        return offset;
      }
      if (!matched && (title.includes(target) || target.includes(title))) {
        matched = true;
        matchedLevel = level;
      }
    }
    offset += line.length + (index < lines.length - 1 ? 1 : 0);
  }

  return matched ? doc.length : null;
}
