import { ref } from "vue";

export type AppToastKind = "success" | "error" | "info";

export type AppToastState = {
  kind: AppToastKind;
  message: string;
};

const toast = ref<AppToastState | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function useAppToast() {
  function showToast(kind: AppToastKind, message: string, durationMs = 3200) {
    toast.value = { kind, message };
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      toast.value = null;
      hideTimer = null;
    }, durationMs);
  }

  function dismissToast() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    toast.value = null;
  }

  return { toast, showToast, dismissToast };
}
