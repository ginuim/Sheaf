import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ref } from "vue";
import { parseOutline } from "./useOutline";
import { translate } from "./useLocale";

function untitledName() {
  return translate("file.untitled");
}
const MAX_MARKDOWN_BASENAME_LENGTH = 80;
const WINDOWS_RESERVED_BASENAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

function sanitizeMarkdownFileBaseName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\-_.\s]/gu, "_")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._\s-]+|[._\s-]+$/g, "");

  if (!normalized) return "";

  const clipped = normalized.slice(0, MAX_MARKDOWN_BASENAME_LENGTH).replace(/[._\s-]+$/g, "");
  if (!clipped) return "";

  return WINDOWS_RESERVED_BASENAMES.has(clipped.toLowerCase()) ? `_${clipped}` : clipped;
}

function getDefaultMarkdownFileName(content: string): string {
  const firstHeading = parseOutline(content).find((item) => item.level === 1)?.text ?? "";
  const baseName = sanitizeMarkdownFileBaseName(firstHeading) || untitledName();
  return `${baseName}.md`;
}

export function useFile(
  onLoad: (content: string) => void,
  onPathOpened?: (path: string) => void,
  onSaved?: () => void,
) {
  const filePath = ref<string | null>(null);
  const fileName = ref(untitledName());

  async function loadPath(path: string): Promise<boolean> {
    try {
      const content = await readTextFile(path);
      filePath.value = path;
      fileName.value = path.split(/[/\\]/).pop() ?? untitledName();
      onLoad(content);
      onPathOpened?.(path);
      return true;
    } catch {
      return false;
    }
  }

  async function openFile(): Promise<boolean> {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });

    if (!selected) return false;
    return loadPath(selected);
  }

  async function openFileAtPath(path: string): Promise<boolean> {
    return loadPath(path);
  }

  function newFile() {
    filePath.value = null;
    fileName.value = untitledName();
    onLoad("");
  }

  async function saveFile(content: string) {
    let target = filePath.value;

    if (!target) {
      const selected = await save({
        defaultPath: getDefaultMarkdownFileName(content),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!selected) return;
      target = selected;
      filePath.value = selected;
      fileName.value = selected.split(/[/\\]/).pop() ?? untitledName();
    }

    await writeTextFile(target, content);
    onPathOpened?.(target);
    onSaved?.();
  }

  async function saveFileAs(content: string) {
    const selected = await save({
      defaultPath: getDefaultMarkdownFileName(content),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!selected) return;

    filePath.value = selected;
    fileName.value = selected.split(/[/\\]/).pop() ?? untitledName();
    await writeTextFile(selected, content);
    onPathOpened?.(selected);
    onSaved?.();
  }

  function restoreFileState(state: {
    content: string;
    fileName: string;
    filePath: string | null;
  }) {
    filePath.value = state.filePath;
    fileName.value = state.fileName;
    onLoad(state.content);
  }

  return {
    filePath,
    fileName,
    restoreFileState,
    openFile,
    openFileAtPath,
    newFile,
    saveFile,
    saveFileAs,
  };
}
