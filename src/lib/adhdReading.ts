const SKIP_SELECTOR = [
  "a",
  "b",
  "button",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "kbd",
  "math",
  "pre",
  "samp",
  "strong",
  "svg",
  ".katex",
  ".mermaid",
].join(", ");

const LATIN_WORD_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9'’-]{2,}/g;

function anchorLength(word: string) {
  return Math.max(1, Math.ceil(word.length * 0.45));
}

function emphasizeTextNode(node: Text) {
  const text = node.nodeValue ?? "";
  const matches = [...text.matchAll(LATIN_WORD_PATTERN)];
  if (matches.length === 0 || !node.parentNode) return;

  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of matches) {
    const word = match[0];
    const start = match.index ?? 0;
    const emphasisEnd = anchorLength(word);

    fragment.append(text.slice(cursor, start));

    const anchor = document.createElement("span");
    anchor.className = "adhd-reading-anchor";
    anchor.textContent = word.slice(0, emphasisEnd);
    fragment.append(anchor, word.slice(emphasisEnd));

    cursor = start + word.length;
  }

  fragment.append(text.slice(cursor));
  node.parentNode.replaceChild(fragment, node);
}

export function enhanceHtmlForAdhdReading(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  textNodes.forEach(emphasizeTextNode);
  return template.innerHTML;
}
