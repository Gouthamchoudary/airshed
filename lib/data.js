/**
 * Narrow untrusted JSON before reading named fields.
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function record(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
export function boundedNumber(value, min, max, fallback) {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
