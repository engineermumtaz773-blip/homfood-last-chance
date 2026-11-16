let lockCount = 0;
let previousBodyOverflow = "";
let previousRootOverflow = "";

export function clearStaleScrollLock() {
  if (typeof document === "undefined" || lockCount !== 0) return;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  previousBodyOverflow = "";
  previousRootOverflow = "";
}

/** Acquire a shared document scroll lock so overlapping dialogs cannot restore
 * overflow early or leave the page stuck after one dialog unmounts. */
export function acquireScrollLock() {
  if (typeof document === "undefined") return () => undefined;
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousBodyOverflow = "";
      previousRootOverflow = "";
    }
  };
}
