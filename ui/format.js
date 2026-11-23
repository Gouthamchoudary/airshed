/** @param {number} number */
export function formatNumber(number, digits = 0) {
  return Number.isFinite(number)
    ? number.toLocaleString('en', { maximumFractionDigits: digits })
    : '–';
}

// Open-Meteo returns wall-clock timestamps, so treat a zone-less string as
// already local to the city and prevent the browser from applying its own offset.
/**
 * @param {string | number | null | undefined} value
 * @param {string} timezone
 * @param {Intl.DateTimeFormatOptions} options
 */
export function formatLocal(value, timezone, options) {
  if (value == null) return '';
  const text = String(value);
  const hasZone = typeof value === 'number' || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const date = new Date(hasZone ? value : text + 'Z');
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: hasZone ? timezone || 'UTC' : 'UTC',
      ...options,
    }).format(date);
  } catch {
    return '';
  }
}
