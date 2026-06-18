import { reactive } from "vue";
import {
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferences,
} from "../lib/appPreferences";

const preferences = reactive(loadAppPreferences());

export function useAppPreferences() {
  function updateAppPreferences(patch: Partial<AppPreferences>) {
    Object.assign(preferences, patch);
    saveAppPreferences({ ...preferences });
  }

  return {
    preferences,
    updateAppPreferences,
  };
}
