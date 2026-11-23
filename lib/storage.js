/** Best-effort browser storage. The app also works in private or restricted sessions. */
export function readJSON(key, fallback = null) {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quotas and storage permissions vary by browser.
  }
}
