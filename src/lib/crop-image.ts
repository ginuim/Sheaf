export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplayCropRect = CropRect;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeCropRect(
  rect: DisplayCropRect,
  bounds: { width: number; height: number },
): DisplayCropRect {
  const width = clamp(rect.width, 1, bounds.width);
  const height = clamp(rect.height, 1, bounds.height);
  const x = clamp(rect.x, 0, Math.max(bounds.width - width, 0));
  const y = clamp(rect.y, 0, Math.max(bounds.height - height, 0));
  return { x, y, width, height };
}

export function cropRectToNatural(
  rect: DisplayCropRect,
  displaySize: { width: number; height: number },
  naturalSize: { width: number; height: number },
): CropRect {
  const scaleX = naturalSize.width / displaySize.width;
  const scaleY = naturalSize.height / displaySize.height;

  return {
    x: Math.round(rect.x * scaleX),
    y: Math.round(rect.y * scaleY),
    width: Math.max(1, Math.round(rect.width * scaleX)),
    height: Math.max(1, Math.round(rect.height * scaleY)),
  };
}

export async function cropImageElement(
  image: HTMLImageElement,
  rect: CropRect,
  mimeType = "image/png",
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode cropped image."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

export function mimeTypeFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

export function extensionFromMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

export function extensionFromSrc(src: string): string {
  const match = src.match(/\.([a-z0-9]+)(?:$|[?#])/i);
  if (!match) return "png";
  const extension = match[1].toLowerCase();
  if (extension === "jpeg") return "jpg";
  if (extension === "png" || extension === "jpg" || extension === "gif" || extension === "webp") {
    return extension;
  }
  return "png";
}

export function sourceNameFromSrc(src: string): string {
  try {
    const pathname = new URL(src).pathname;
    const name = pathname.split("/").pop();
    if (name) return name;
  } catch {
    // ignore invalid URL
  }
  return `image.${extensionFromSrc(src)}`;
}

export function isExternalImageSrc(src: string): boolean {
  const trimmed = src.trim();
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed) && !trimmed.startsWith("data:");
}
