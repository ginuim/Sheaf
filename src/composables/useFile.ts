import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ref } from "vue";

export function useFile(
  onLoad: (content: string) => void,
  onPathOpened?: (path: string) => void,
  onSaved?: () => void,
) {
  const filePath = ref<string | null>(null);
  const fileName = ref("未命名");

  async function loadPath(path: string): Promise<boolean> {
    try {
      const content = await readTextFile(path);
      filePath.value = path;
      fileName.value = path.split(/[/\\]/).pop() ?? "未命名";
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
    fileName.value = "未命名";
    onLoad("");
  }

  async function saveFile(content: string) {
    let target = filePath.value;

    if (!target) {
      const selected = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!selected) return;
      target = selected;
      filePath.value = selected;
      fileName.value = selected.split(/[/\\]/).pop() ?? "未命名";
    }

    await writeTextFile(target, content);
    onPathOpened?.(target);
    onSaved?.();
  }

  async function saveFileAs(content: string) {
    const selected = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!selected) return;

    filePath.value = selected;
    fileName.value = selected.split(/[/\\]/).pop() ?? "未命名";
    await writeTextFile(selected, content);
    onPathOpened?.(selected);
    onSaved?.();
  }

  return {
    filePath,
    fileName,
    openFile,
    openFileAtPath,
    newFile,
    saveFile,
    saveFileAs,
  };
}
