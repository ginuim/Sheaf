import mermaid from "mermaid";

let renderSeq = 0;

type MermaidThemeId = "light" | "dark";

export type MermaidVector = {
  markup: string;
  width: number;
  height: number;
};

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

function initMermaid(themeId: MermaidThemeId, htmlLabels: boolean): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: SHEAF_THEME_VARS[themeId],
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    htmlLabels,
  });
}

function getMermaidSource(el: Element): string {
  return el.getAttribute("data-mermaid-source") ?? el.textContent ?? "";
}

function normalizeVectorSvg(markup: string): MermaidVector {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = doc.documentElement;
  const viewBox = (svg.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));
  const hasViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite);
  const width = hasViewBox ? viewBox[2] : 800;
  const height = hasViewBox ? viewBox[3] : 450;

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  // mermaid writes an inline `max-width`, which would fight the viewer's own
  // fit-to-window sizing.
  const style = svg.getAttribute("style");
  if (style) {
    const cleaned = style.replace(/max-width\s*:[^;]*;?/gi, "").trim();
    if (cleaned) svg.setAttribute("style", cleaned);
    else svg.removeAttribute("style");
  }

  return {
    markup: new XMLSerializer().serializeToString(svg),
    width,
    height,
  };
}

/**
 * Renders a diagram as a standalone, resolution-independent SVG.
 *
 * Mermaid's default `htmlLabels` wraps every label in a `<foreignObject>` with
 * regular HTML inside, which the browser rasterizes as a composited layer and
 * turns blurry once the viewer scales it up. Rendering labels as real `<text>`
 * keeps the whole diagram vector, so it stays sharp at any zoom level.
 */
export async function renderMermaidSvg(
  source: string,
  isDark?: boolean,
): Promise<MermaidVector> {
  initMermaid(currentTheme(isDark), false);
  const id = `sheaf-mermaid-vector-${Date.now()}-${renderSeq++}`;
  const { svg } = await mermaid.render(id, source);
  return normalizeVectorSvg(svg);
}

export async function renderMermaidIn(
  root: ParentNode,
  isDark?: boolean,
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".mermaid"));
  if (!nodes.length) return;

  const themeId = currentTheme(isDark);
  initMermaid(themeId, true);

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
