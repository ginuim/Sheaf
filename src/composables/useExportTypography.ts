import { reactive, watch } from "vue";
import {
  loadExportTypographySettings,
  saveExportTypographySettings,
} from "../lib/exportTypographySettings";

const settings = reactive(loadExportTypographySettings());

let watchAttached = false;

function ensureWatch() {
  if (watchAttached) return;
  watchAttached = true;

  watch(
    settings,
    () => {
      saveExportTypographySettings(settings);
    },
    { deep: true },
  );
}

export function useExportTypography() {
  ensureWatch();

  return { settings };
}
