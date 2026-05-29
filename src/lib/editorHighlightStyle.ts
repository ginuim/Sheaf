import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--ink-syntax-meta)" },
  { tag: tags.link, color: "var(--ink-syntax-url)", textDecoration: "underline" },
  {
    tag: tags.heading,
    color: "var(--ink-syntax-heading)",
    textDecoration: "underline",
    fontWeight: "bold",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "var(--ink-syntax-keyword)" },
  {
    tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName],
    color: "var(--ink-syntax-url)",
  },
  { tag: [tags.literal, tags.inserted], color: "var(--ink-syntax-literal)" },
  { tag: [tags.string, tags.deleted], color: "var(--ink-syntax-string)" },
  {
    tag: [tags.regexp, tags.escape, tags.special(tags.string)],
    color: "var(--ink-syntax-regexp)",
  },
  { tag: tags.definition(tags.variableName), color: "var(--ink-syntax-name)" },
  { tag: tags.local(tags.variableName), color: "var(--ink-syntax-name)" },
  { tag: [tags.typeName, tags.namespace], color: "var(--ink-syntax-type)" },
  { tag: tags.className, color: "var(--ink-syntax-type)" },
  {
    tag: [tags.special(tags.variableName), tags.macroName],
    color: "var(--ink-syntax-name)",
  },
  { tag: tags.definition(tags.propertyName), color: "var(--ink-syntax-name)" },
  { tag: tags.comment, color: "var(--ink-syntax-comment)" },
  { tag: tags.invalid, color: "var(--ink-syntax-invalid)" },
]);
