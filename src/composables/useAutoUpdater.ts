import { onMounted, onUnmounted, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { checkAppUpdate, isUpdaterRuntime, type AppUpdate } from "../lib/appUpdater";
import { loadAppPreferences } from "../lib/appPreferences";
import { useAppToast } from "./useAppToast";
import { useLocale } from "./useLocale";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function useAutoUpdater() {
  const { t } = useLocale();
  const { showToast, dismissToast } = useAppToast();
  const appVersion = ref("");
  const enabled = isUpdaterRuntime();
  const checking = ref(false);
  const downloading = ref(false);
  const downloadedUpdate = ref<AppUpdate | null>(null);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function formatVersionMessage(message: string, update: AppUpdate, progress?: number | null) {
    const suffix =
      progress != null && progress >= 0 ? ` (${progress}%)` : ` (v${update.version})`;
    return `${message}${suffix}`;
  }

  async function restartUpdate(update: AppUpdate) {
    try {
      showToast("loading", t("app.updateRestarting"), 0);
      await update.restart();
    } catch {
      showToast("error", t("app.updateFailed"));
    }
  }

  function showReadyToRestart(update: AppUpdate) {
    downloadedUpdate.value = update;
    showToast("success", formatVersionMessage(t("app.updateReadyToRestart"), update), 0, {
      label: t("app.updateRestartNow"),
      onClick: () => {
        void restartUpdate(update);
      },
    });
  }

  function showDownloadProgress(update: AppUpdate, progress: number | null) {
    showToast(
      "loading",
      formatVersionMessage(t("app.updateDownloading"), update, progress),
      0,
    );
  }

  async function downloadUpdate(update: AppUpdate, options: { notifyFailure?: boolean } = {}) {
    if (downloading.value) return;
    if (downloadedUpdate.value?.version === update.version) {
      showReadyToRestart(downloadedUpdate.value);
      return;
    }

    downloading.value = true;
    showDownloadProgress(update, null);

    try {
      await update.downloadAndInstall({
        onProgress: ({ progress }) => {
          showDownloadProgress(update, progress);
        },
      });
      showReadyToRestart(update);
    } catch {
      if (options.notifyFailure !== false) {
        showToast("error", t("app.updateFailed"));
      }
    } finally {
      downloading.value = false;
    }
  }

  async function checkForUpdates(options: { manual?: boolean } = {}) {
    if (!enabled || checking.value) return;

    checking.value = true;
    if (options.manual) {
      showToast("loading", t("app.updateChecking"), 0);
    }

    try {
      const update = await checkAppUpdate();
      if (update) {
        await downloadUpdate(update, { notifyFailure: options.manual });
        return;
      }

      if (options.manual) {
        showToast("success", t("app.updateCurrent"));
      } else {
        dismissToast();
      }
    } catch {
      if (options.manual) {
        showToast("error", t("app.updateFailed"));
      }
    } finally {
      checking.value = false;
    }
  }

  async function checkForUpdatesInBackground() {
    if (!enabled || checking.value || downloading.value) return;
    if (!loadAppPreferences().autoUpdateEnabled) return;

    checking.value = true;
    try {
      const update = await checkAppUpdate();
      if (update) {
        await downloadUpdate(update, { notifyFailure: false });
      }
    } catch {
      // Background checks should stay silent.
    } finally {
      checking.value = false;
    }
  }

  onMounted(async () => {
    if (!enabled) return;

    try {
      appVersion.value = await getVersion();
    } catch {
      appVersion.value = "";
    }

    void checkForUpdatesInBackground();
    intervalId = setInterval(() => {
      void checkForUpdatesInBackground();
    }, CHECK_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (intervalId) clearInterval(intervalId);
  });

  return {
    appVersion,
    checkForUpdates,
    enabled,
  };
}
