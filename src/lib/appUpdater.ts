import { isTauri } from "@tauri-apps/api/core";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppUpdateProgress = {
  contentLength: number | null;
  downloaded: number;
  progress: number | null;
};

export type AppUpdate = {
  body?: string;
  currentVersion: string;
  date?: string;
  downloadAndInstall: (callbacks?: {
    onProgress?: (progress: AppUpdateProgress) => void;
  }) => Promise<void>;
  restart: () => Promise<void>;
  version: string;
};

function resolveProgress(downloaded: number, contentLength: number | null) {
  if (!contentLength || contentLength <= 0) return null;
  return Math.min(100, Math.round((downloaded / contentLength) * 100));
}

function emitProgress({
  contentLength,
  downloaded,
  onProgress,
}: {
  contentLength: number | null;
  downloaded: number;
  onProgress?: (progress: AppUpdateProgress) => void;
}) {
  onProgress?.({
    contentLength,
    downloaded,
    progress: resolveProgress(downloaded, contentLength),
  });
}

export function isUpdaterRuntime() {
  return isTauri();
}

export async function checkAppUpdate(): Promise<AppUpdate | null> {
  if (!isUpdaterRuntime()) return null;

  const update = await check();
  if (!update) return null;

  return {
    body: update.body,
    currentVersion: update.currentVersion,
    date: update.date,
    async downloadAndInstall(callbacks = {}) {
      let contentLength: number | null = null;
      let downloaded = 0;

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? null;
          downloaded = 0;
          emitProgress({ contentLength, downloaded, onProgress: callbacks.onProgress });
          return;
        }

        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          emitProgress({ contentLength, downloaded, onProgress: callbacks.onProgress });
          return;
        }

        if (event.event === "Finished") {
          if (contentLength !== null) downloaded = contentLength;
          emitProgress({ contentLength, downloaded, onProgress: callbacks.onProgress });
        }
      });
    },
    async restart() {
      await relaunch();
    },
    version: update.version,
  };
}
