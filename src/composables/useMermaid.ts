import mermaid from "mermaid";

let renderSeq = 0;

function currentTheme(isDark?: boolean): "default" | "dark" {
  if (typeof isDark === "boolean") return isDark ? "dark" : "default";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
}

function getMermaidSource(el: Element): string {
  return el.getAttribute("data-mermaid-source") ?? el.textContent ?? "";
}

export async function renderMermaidIn(
  root: ParentNode,
  isDark?: boolean,
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".mermaid"));
  if (!nodes.length) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: currentTheme(isDark),
  });

  for (const node of nodes) {
    const source = getMermaidSource(node).trim();
    if (!source) continue;

    const renderedTheme = node.getAttribute("data-mermaid-theme");
    if (node.getAttribute("data-mermaid-rendered") === "true" && renderedTheme === currentTheme(isDark)) {
      continue;
    }

    try {
      const id = `sheaf-mermaid-${Date.now()}-${renderSeq++}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      node.innerHTML = svg;
      node.setAttribute("data-mermaid-rendered", "true");
      node.setAttribute("data-mermaid-theme", currentTheme(isDark));
      bindFunctions?.(node);
    } catch (error) {
      node.textContent = source;
      node.classList.add("mermaid-error");
      node.setAttribute("data-mermaid-rendered", "false");
      console.error("Mermaid render error:", error);
    }
  }
}
