import type { EditorView } from "@codemirror/view";
import { EditorView as EditorViewCtor } from "@codemirror/view";
import {
  saveEditorImageFile,
  saveEditorImageFromPath,
  type SavedEditorImage,
} from "./save-editor-image";

export type EditorImageInsertOptions = {
  getDocumentPath: () => string | null;
  ensureDocumentSaved: () => Promise<string | null>;
  onRequiresSavedDocument: () => void;
  onInsertFailed: () => void;
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

function dropInsertPosition(view: EditorView, event: DragEvent): number {
  const position = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });
  return position ?? view.state.selection.main.head;
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

async function resolveDocumentPath(options: EditorImageInsertOptions): Promise<string | null> {
  let documentPath = options.getDocumentPath();
  if (documentPath) return documentPath;

  documentPath = await options.ensureDocumentSaved();
  if (!documentPath) {
    options.onRequiresSavedDocument();
    return null;
  }
  return documentPath;
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
      savedImages.push(await saveEditorImageFile(documentPath, file));
    } catch {
      options.onInsertFailed();
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
      savedImages.push(await saveEditorImageFromPath(documentPath, path));
    } catch {
      options.onInsertFailed();
      return;
    }
  }

  insertSavedImages(view, insertPos, savedImages);
}

function insertImagesAtDrop(
  view: EditorView,
  event: DragEvent,
  files: File[],
  options: EditorImageInsertOptions,
) {
  const insertPos = dropInsertPosition(view, event);
  void insertEditorImagesFromFiles(view, insertPos, files, options);
}

function insertImagesAtCursor(
  view: EditorView,
  files: File[],
  options: EditorImageInsertOptions,
) {
  const insertPos = view.state.selection.main.head;
  void insertEditorImagesFromFiles(view, insertPos, files, options);
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
      insertImagesAtDrop(view, event, files, options);
      return true;
    },
    paste(event, view) {
      const files = imageFilesFromDataTransfer(event.clipboardData);
      if (!files.length) return false;
      event.preventDefault();
      insertImagesAtCursor(view, files, options);
      return true;
    },
  });
}
