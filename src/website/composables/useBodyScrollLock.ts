let lockCount = 0;
let savedScrollY = 0;

export function lockBodyScroll() {
  lockCount += 1;
  if (lockCount > 1) return;

  savedScrollY = window.scrollY;
  document.documentElement.classList.add("landing-scroll-locked");
  document.body.style.position = "fixed";
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  document.documentElement.classList.remove("landing-scroll-locked");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, savedScrollY);
}

export function resetBodyScrollLock() {
  lockCount = 0;
  document.documentElement.classList.remove("landing-scroll-locked");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
}
