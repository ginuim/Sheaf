import mermaid from "mermaid";

let renderSeq = 0;

type MermaidThemeId = "light" | "dark";

function resolveIsDark(isDark?: boolean): boolean {
  if (typeof isDark === "boolean") return isDark;
  return document.documentElement.dataset.theme === "dark";
}

function currentTheme(isDark?: boolean): MermaidThemeId {
  return resolveIsDark(isDark) ? "dark" : "light";
}

/** 与 global.css --ink-accent 等变量对齐的绿色主题 */
const SHEAF_THEME_VARS: Record<MermaidThemeId, Record<string, string | boolean>> = {
  light: {
    darkMode: false,
    background: "#f7f4ef",
    primaryColor: "#dce6e0",
    primaryTextColor: "#2a2520",
    primaryBorderColor: "#3d5a4c",
    secondaryColor: "#eef3ef",
    secondaryTextColor: "#2a2520",
    secondaryBorderColor: "#5a7a68",
    tertiaryColor: "#faf8f5",
    tertiaryTextColor: "#2a2520",
    tertiaryBorderColor: "#3d5a4c",
    lineColor: "#3d5a4c",
    textColor: "#2a2520",
    mainBkg: "#dce6e0",
    nodeBorder: "#3d5a4c",
    clusterBkg: "#f7f4ef",
    clusterBorder: "#3d5a4c",
    titleColor: "#2a2520",
    edgeLabelBackground: "#f7f4ef",
    noteBkgColor: "#eef3ef",
    noteTextColor: "#2a2520",
    noteBorderColor: "#3d5a4c",
    actorBkg: "#dce6e0",
    actorBorder: "#3d5a4c",
    actorTextColor: "#2a2520",
    signalColor: "#3d5a4c",
    signalTextColor: "#2a2520",
    labelBoxBkgColor: "#dce6e0",
    labelBoxBorderColor: "#3d5a4c",
    labelTextColor: "#2a2520",
    activationBkgColor: "#eef3ef",
    activationBorderColor: "#3d5a4c",
  },
  dark: {
    darkMode: true,
    background: "#1a1816",
    primaryColor: "#2d4036",
    primaryTextColor: "#e8e4dc",
    primaryBorderColor: "#6b9b82",
    secondaryColor: "#242120",
    secondaryTextColor: "#e8e4dc",
    secondaryBorderColor: "#6b9b82",
    tertiaryColor: "#1e1c19",
    tertiaryTextColor: "#e8e4dc",
    tertiaryBorderColor: "#6b9b82",
    lineColor: "#6b9b82",
    textColor: "#e8e4dc",
    mainBkg: "#2d4036",
    nodeBorder: "#6b9b82",
    clusterBkg: "#1a1816",
    clusterBorder: "#6b9b82",
    titleColor: "#e8e4dc",
    edgeLabelBackground: "#1a1816",
    noteBkgColor: "#242120",
    noteTextColor: "#e8e4dc",
    noteBorderColor: "#6b9b82",
    actorBkg: "#2d4036",
    actorBorder: "#6b9b82",
    actorTextColor: "#e8e4dc",
    signalColor: "#6b9b82",
    signalTextColor: "#e8e4dc",
    labelBoxBkgColor: "#2d4036",
    labelBoxBorderColor: "#6b9b82",
    labelTextColor: "#e8e4dc",
    activationBkgColor: "#242120",
    activationBorderColor: "#6b9b82",
  },
};

function initMermaid(themeId: MermaidThemeId): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: SHEAF_THEME_VARS[themeId],
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  });
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

  const themeId = currentTheme(isDark);
  initMermaid(themeId);

  for (const node of nodes) {
    const source = getMermaidSource(node).trim();
    if (!source) continue;

    const renderedTheme = node.getAttribute("data-mermaid-theme");
    const cachedTheme =
      renderedTheme === "default" ? "light" : (renderedTheme as MermaidThemeId | null);
    if (node.getAttribute("data-mermaid-rendered") === "true" && cachedTheme === themeId) {
      continue;
    }

    try {
      const id = `sheaf-mermaid-${Date.now()}-${renderSeq++}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      node.innerHTML = svg;
      node.setAttribute("data-mermaid-rendered", "true");
      node.setAttribute("data-mermaid-theme", themeId);
      bindFunctions?.(node);
    } catch (error) {
      node.textContent = source;
      node.classList.add("mermaid-error");
      node.setAttribute("data-mermaid-rendered", "false");
      console.error("Mermaid render error:", error);
    }
  }
}
