/**
 * Best-effort browser storage. Callers validate decoded values before using them.
 * @param {string} key
 * @param {unknown} fallback
 * @returns {unknown}
 */
export function readJSON(key, fallback = null) {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function writeJSON(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quotas and storage permissions vary by browser.
  }
}
