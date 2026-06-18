export type MarkdownFormatCommand =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "bold"
  | "italic"
  | "strikethrough"
  | "link"
  | "unorderedList"
  | "orderedList"
  | "task"
  | "quote"
  | "inlineCode"
  | "codeBlock"
  | "table"
  | "image"
  | "horizontalRule";

export const markdownFormatToolIds = [
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "bold",
  "italic",
  "strikethrough",
  "link",
  "unorderedList",
  "orderedList",
  "task",
  "quote",
  "inlineCode",
  "codeBlock",
  "table",
  "image",
  "horizontalRule",
  "formatSpacing",
] as const;

export type MarkdownFormatToolId = (typeof markdownFormatToolIds)[number];
