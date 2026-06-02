declare module "markdown-it-katex" {
  import type MarkdownIt from "markdown-it";

  type KatexOptions = {
    throwOnError?: boolean;
    errorColor?: string;
    displayMode?: boolean;
  };

  const markdownItKatex: MarkdownIt.PluginWithOptions<KatexOptions>;
  export default markdownItKatex;
}
