import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { EditorView as EditorViewCtor } from "@codemirror/view";
import {
  saveEditorImageFile,
  saveEditorImageFromPath,
  type SavedEditorImage,
} from "./save-editor-image";
import { htmlToMarkdown } from "./html-to-markdown";
import type { ImageHostingPreferences } from "./appPreferences";
import { shouldUploadToDefaultImageHost } from "./imageHosting";

export type EditorImageInsertOptions = {
  getDocumentPath: () => string | null;
  ensureDocumentSaved: () => Promise<string | null>;
  getImageHostingPreferences?: () => ImageHostingPreferences | undefined;
  onRequiresSavedDocument: () => void;
  onInsertFailed: () => void;
  onUploadFailed?: () => void;
};

function imageFilesFromDataTransfer(dataTransfer: DataTransfer | null | undefined): File[] {
  const files = dataTransfer?.files;
  if (!files?.length) return [];

  const images: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (file?.type.startsWith("image/")) images.push(file);
  }
  return images;
}

function cursorInsertPosition(view: EditorView): number {
  return view.state.selection.main.head;
}

function buildInsertText(images: SavedEditorImage[]): string {
  return images.map((image) => image.markdown).join("\n\n");
}

function insertSavedImages(view: EditorView, insertPos: number, savedImages: SavedEditorImage[]) {
  if (!savedImages.length) return;

  const markdown = buildInsertText(savedImages);
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: markdown },
    selection: { anchor: insertPos + markdown.length },
    scrollIntoView: true,
    userEvent: "input.drop",
  });
  view.focus();
}

function insertMarkdownFromClipboard(view: EditorView, markdown: string) {
  const transaction = view.state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: markdown },
    range: EditorSelection.cursor(range.from + markdown.length),
  }));

  view.dispatch({
    ...transaction,
    scrollIntoView: true,
    userEvent: "input.paste",
  });
  view.focus();
}

function markdownFromClipboardHtml(dataTransfer: DataTransfer | null | undefined): string {
  const html = dataTransfer?.getData("text/html") ?? "";
  if (!html.trim()) return "";
  return htmlToMarkdown(html);
}

async function resolveDocumentPath(options: EditorImageInsertOptions): Promise<string | null> {
  const imageHosting = options.getImageHostingPreferences?.();
  if (imageHosting && shouldUploadToDefaultImageHost(imageHosting)) {
    return options.getDocumentPath();
  }

  let documentPath = options.getDocumentPath();
  if (documentPath) return documentPath;

  documentPath = await options.ensureDocumentSaved();
  if (!documentPath) {
    options.onRequiresSavedDocument();
    return null;
  }
  return documentPath;
}

function isUploadEnabled(options: EditorImageInsertOptions) {
  const imageHosting = options.getImageHostingPreferences?.();
  return Boolean(imageHosting && shouldUploadToDefaultImageHost(imageHosting));
}

function handleInsertError(options: EditorImageInsertOptions) {
  if (isUploadEnabled(options)) {
    options.onUploadFailed?.();
    return;
  }
  options.onInsertFailed();
}

export async function insertEditorImagesFromFiles(
  view: EditorView,
  insertPos: number,
  files: File[],
  options: EditorImageInsertOptions,
) {
  const documentPath = await resolveDocumentPath(options);
  if (!documentPath) return;

  const savedImages: SavedEditorImage[] = [];
  for (const file of files) {
    try {
      savedImages.push(
        await saveEditorImageFile(documentPath, file, options.getImageHostingPreferences?.()),
      );
    } catch {
      handleInsertError(options);
      return;
    }
  }

  insertSavedImages(view, insertPos, savedImages);
}

export async function insertEditorImagesFromPaths(
  view: EditorView,
  insertPos: number,
  paths: string[],
  options: EditorImageInsertOptions,
) {
  const documentPath = await resolveDocumentPath(options);
  if (!documentPath) return;

  const savedImages: SavedEditorImage[] = [];
  for (const path of paths) {
    try {
      savedImages.push(
        await saveEditorImageFromPath(documentPath, path, options.getImageHostingPreferences?.()),
      );
    } catch {
      handleInsertError(options);
      return;
    }
  }

  insertSavedImages(view, insertPos, savedImages);
}

function insertImagesAtCursor(
  view: EditorView,
  files: File[],
  options: EditorImageInsertOptions,
) {
  void insertEditorImagesFromFiles(view, cursorInsertPosition(view), files, options);
}

export function editorImageInsertExtension(options: EditorImageInsertOptions) {
  return EditorViewCtor.domEventHandlers({
    dragover(event) {
      if (!imageFilesFromDataTransfer(event.dataTransfer).length) return false;
      event.preventDefault();
      return true;
    },
    drop(event, view) {
      const files = imageFilesFromDataTransfer(event.dataTransfer);
      if (!files.length) return false;
      event.preventDefault();
      insertImagesAtCursor(view, files, options);
      return true;
    },
    paste(event, view) {
      const files = imageFilesFromDataTransfer(event.clipboardData);
      if (files.length) {
        event.preventDefault();
        insertImagesAtCursor(view, files, options);
        return true;
      }

      const markdown = markdownFromClipboardHtml(event.clipboardData);
      if (!markdown) return false;

      event.preventDefault();
      insertMarkdownFromClipboard(view, markdown);
      return true;
    },
    beforeinput(event, view) {
      if (event.inputType !== "insertFromPaste" || !(event instanceof InputEvent)) {
        return false;
      }
      if (!event.dataTransfer) return false;
      if (imageFilesFromDataTransfer(event.dataTransfer).length) return false;

      const markdown = markdownFromClipboardHtml(event.dataTransfer);
      if (!markdown) return false;

      event.preventDefault();
      insertMarkdownFromClipboard(view, markdown);
      return true;
    },
  });
}
