import { isTauri } from "@tauri-apps/api/core";
import { toBlob } from "html-to-image";

const PNG_CAPTURE = {
  cacheBust: true,
  skipFonts: true,
  pixelRatio: 2,
} as const;

function waitFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function elementToPngBlob(
  source: HTMLElement,
  backgroundColor: string,
): Promise<Blob> {
  const prevTransform = source.style.transform;
  source.style.transform = "none";
  try {
    await waitFrame();
    await waitFrame();

    let blob: Blob | null = null;
    let previousSize = -1;
    for (let attempt = 0; attempt < 3; attempt++) {
      blob = await toBlob(source, {
        ...PNG_CAPTURE,
        backgroundColor,
        style: { transform: "none" },
        width: Math.max(source.offsetWidth, 1),
        height: Math.max(source.offsetHeight, 1),
      });
      const size = blob?.size ?? 0;
      if (size > 0 && size === previousSize) break;
      previousSize = size;
      await waitFrame();
    }

    if (!blob || blob.size === 0) throw new Error("empty png");
    return blob;
  } finally {
    source.style.transform = prevTransform;
  }
}

export async function writePngToClipboard(blob: Blob | Promise<Blob>): Promise<void> {
  const blobPromise = blob instanceof Promise ? blob : Promise.resolve(blob);
  if (isTauri()) {
    await writePngViaTauri(await blobPromise);
    return;
  }
  await writePngViaNavigator(blobPromise);
}

async function writePngViaNavigator(blobPromise: Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("clipboard unavailable");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blobPromise,
    }),
  ]);
}

async function writePngViaTauri(blob: Blob): Promise<void> {
  const { Image } = await import("@tauri-apps/api/image");
  const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
  const { rgba, width, height } = await pngBlobToRgba(blob);
  const image = await Image.new(rgba, width, height);
  await writeImage(image);
}

async function pngBlobToRgba(blob: Blob): Promise<{
  rgba: Uint8Array;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { rgba: new Uint8Array(data), width, height };
}
