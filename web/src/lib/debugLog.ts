/**
 * Mirrors a console.log into the backend terminal too (POST /api/debug-log)
 * — DevTools inside the small bubble window is painful to read/copy from,
 * so this makes debugging viable by reading terminal output instead.
 *
 * Reserved for low-frequency, meaningful events (state changes, reactions,
 * turns). Anything per-frame belongs in verboseLog.
 */
export function debugLog(...args: unknown[]) {
  console.log(...args);
  try {
    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: args.map((a) => (a instanceof Error ? a.message : a)) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * High-frequency diagnostic logging (per-frame scores etc). Off by default so
 * demos aren't drowned in noise and we don't POST once a second for nothing.
 * Enable from the bubble's DevTools console with:
 *   localStorage.setItem("darpan:verbose", "1")   // then reload
 */
const VERBOSE = (() => {
  try {
    return localStorage.getItem("darpan:verbose") === "1";
  } catch {
    return false;
  }
})();

export function verboseLog(...args: unknown[]) {
  if (VERBOSE) console.log(...args);
}
