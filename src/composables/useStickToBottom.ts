import { onUnmounted, ref, watch } from "vue";

export const STICK_TO_BOTTOM_THRESHOLD_PX = 48;
const USER_INTENT_MS = 400;

const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

export function gapFromBottom(el: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

export function isNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  threshold = STICK_TO_BOTTOM_THRESHOLD_PX,
): boolean {
  return gapFromBottom(el) <= threshold;
}

/**
 * 贴底只认用户手势和是否已经在底部。
 * 内容变高触发的 scroll、以及我们自己写的 scrollTop，都不能改 stuck。
 * 否则流式输出会把用户往下拽，用户一滚又被判定成还在底部。
 */
export function nextStuckState(input: {
  stuck: boolean;
  programmatic: boolean;
  userIntent: boolean;
  nearBottom: boolean;
}): boolean {
  if (input.programmatic) return input.stuck;
  if (input.nearBottom) return true;
  if (input.userIntent) return false;
  return input.stuck;
}

export function useStickToBottom(options?: {
  threshold?: number;
  onUserIntent?: () => void;
}) {
  const threshold = options?.threshold ?? STICK_TO_BOTTOM_THRESHOLD_PX;
  const scroller = ref<HTMLElement | null>(null);
  const content = ref<HTMLElement | null>(null);
  const stuck = ref(true);

  let programmatic = false;
  let userIntentUntil = 0;
  let pinRaf = 0;
  let observer: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function markUserIntent() {
    userIntentUntil = now() + USER_INTENT_MS;
    options?.onUserIntent?.();
  }

  function pinNow() {
    const el = scroller.value;
    if (!el || !stuck.value) return;
    programmatic = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      programmatic = false;
    });
  }

  function schedulePin() {
    if (!stuck.value) return;
    pinNow();
    if (pinRaf) return;
    pinRaf = requestAnimationFrame(() => {
      pinNow();
      pinRaf = requestAnimationFrame(() => {
        pinRaf = 0;
        pinNow();
      });
    });
  }

  function pinToBottom() {
    stuck.value = true;
    pinNow();
    schedulePin();
  }

  function release() {
    stuck.value = false;
  }

  function onScroll() {
    const el = scroller.value;
    if (!el) return;
    stuck.value = nextStuckState({
      stuck: stuck.value,
      programmatic,
      userIntent: now() < userIntentUntil,
      nearBottom: isNearBottom(el, threshold),
    });
  }

  function onWheel(event: WheelEvent) {
    markUserIntent();
    if (event.deltaY < 0) {
      stuck.value = false;
      return;
    }
    const el = scroller.value;
    if (el && isNearBottom(el, threshold)) stuck.value = true;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!SCROLL_KEYS.has(event.key)) return;
    markUserIntent();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.target === scroller.value) markUserIntent();
  }

  function bindScroller(el: HTMLElement) {
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", markUserIntent, { passive: true });
    el.addEventListener("touchmove", markUserIntent, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("keydown", onKeyDown);
  }

  function unbindScroller(el: HTMLElement) {
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("touchstart", markUserIntent);
    el.removeEventListener("touchmove", markUserIntent);
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("keydown", onKeyDown);
  }

  function syncObserver() {
    observer?.disconnect();
    mutationObserver?.disconnect();
    const el = scroller.value;
    const inner = content.value ?? el?.firstElementChild;
    if (!el) return;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => schedulePin());
      observer.observe(el);
      if (inner && inner !== el) observer.observe(inner);
    }
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => schedulePin());
      mutationObserver.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  watch(
    [scroller, content],
    ([el], prev) => {
      const prevEl = prev?.[0] ?? null;
      if (prevEl && prevEl !== el) unbindScroller(prevEl);
      if (el && el !== prevEl) bindScroller(el);
      syncObserver();
    },
    { flush: "post", immediate: true },
  );

  onUnmounted(() => {
    if (pinRaf) cancelAnimationFrame(pinRaf);
    observer?.disconnect();
    mutationObserver?.disconnect();
    if (scroller.value) unbindScroller(scroller.value);
  });

  return { scroller, content, stuck, pinToBottom, release };
}
