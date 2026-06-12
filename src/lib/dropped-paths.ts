const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "heic",
  "heif",
]);

const DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "txt"]);

function fileExtension(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? path;
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function filterImagePaths(paths: string[]): string[] {
  return paths.filter((path) => IMAGE_EXTENSIONS.has(fileExtension(path)));
}

export function filterDocumentPaths(paths: string[]): string[] {
  return paths.filter((path) => DOCUMENT_EXTENSIONS.has(fileExtension(path)));
}
