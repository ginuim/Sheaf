import { ref } from "vue";

export type AppToastKind = "success" | "error" | "info" | "loading";

export type AppToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

export type AppToastState = {
  kind: AppToastKind;
  message: string;
  action?: AppToastAction;
};

const toast = ref<AppToastState | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function useAppToast() {
  function showToast(
    kind: AppToastKind,
    message: string,
    durationMs = 3200,
    action?: AppToastAction,
  ) {
    toast.value = { kind, message, action };
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (durationMs > 0) {
      hideTimer = setTimeout(() => {
        toast.value = null;
        hideTimer = null;
      }, durationMs);
    }
  }

  function dismissToast() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    toast.value = null;
  }

  return { toast, showToast, dismissToast };
}
