import { nonEmptyString, record } from '../lib/data.js';
import { fetchJSON } from '../lib/http.js';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';

/** @type {[string, string, number, number, string][]} */
const presets = [
  ['New Delhi', 'India', 28.614, 77.209, 'Asia/Kolkata'],
  ['Mumbai', 'India', 19.076, 72.878, 'Asia/Kolkata'],
  ['Bengaluru', 'India', 12.972, 77.595, 'Asia/Kolkata'],
  ['Hyderabad', 'India', 17.385, 78.487, 'Asia/Kolkata'],
  ['Panaji', 'India', 15.498, 73.827, 'Asia/Kolkata'],
  ['Warangal', 'India', 17.969, 79.594, 'Asia/Kolkata'],
  ['Kolkata', 'India', 22.573, 88.364, 'Asia/Kolkata'],
  ['Chennai', 'India', 13.083, 80.271, 'Asia/Kolkata'],
  ['Lucknow', 'India', 26.847, 80.946, 'Asia/Kolkata'],
  ['Lahore', 'Pakistan', 31.55, 74.344, 'Asia/Karachi'],
  ['Dhaka', 'Bangladesh', 23.81, 90.413, 'Asia/Dhaka'],
  ['Kathmandu', 'Nepal', 27.717, 85.324, 'Asia/Kathmandu'],
  ['Beijing', 'China', 39.904, 116.407, 'Asia/Shanghai'],
  ['London', 'United Kingdom', 51.507, -0.128, 'Europe/London'],
  ['New York', 'United States', 40.713, -74.006, 'America/New_York'],
  ['Los Angeles', 'United States', 34.052, -118.244, 'America/Los_Angeles'],
];

export const cities = presets.map(([name, country, lat, lon, timezone]) => ({
  name,
  country,
  lat,
  lon,
  timezone,
}));

/**
 * @param {unknown} value
 * @returns {value is import('../types/contracts.js').City}
 */
export function isCity(value) {
  const { name, lat, lon, ...metadata } = record(value);
  const coordinates =
    typeof lat === 'number' &&
    Math.abs(lat) <= 90 &&
    typeof lon === 'number' &&
    Math.abs(lon) <= 180;
  return (
    nonEmptyString(name) &&
    coordinates &&
    ['country', 'timezone', 'region', 'admin1'].every(
      (key) => metadata[key] === undefined || typeof metadata[key] === 'string',
    )
  );
}

/**
 * @param {unknown} query
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<import('../types/contracts.js').City[]>}
 */
export async function searchCities(query, { signal } = {}) {
  const term = String(query || '')
    .trim()
    .slice(0, 100);
  if (!term) return cities.slice(0, 6);
  const lower = term.toLowerCase();
  const presetTerm = ['goa', 'panjim', 'panaji goa'].includes(lower) ? 'panaji' : lower;
  const presets = cities.filter((city) => city.name.toLowerCase().includes(presetTerm));
  if (term.length < 2) return presets;
  const params = new URLSearchParams({ name: term, count: '8', language: 'en', format: 'json' });
  try {
    const { results } = record(await fetchJSON(`${GEO}?${params}`, 3500, { signal }));
    /** @type {unknown[]} */
    const candidates = Array.isArray(results) ? results : [];
    /** @type {unknown[]} */
    const mapped = candidates.map((result) => {
      const { name, country, country_code, admin1, latitude, longitude, timezone } = record(result);
      return {
        name,
        lat: latitude,
        lon: longitude,
        country: [country, country_code].find(nonEmptyString) ?? '',
        region: nonEmptyString(admin1) ? admin1 : '',
        timezone: nonEmptyString(timezone) ? timezone : 'UTC',
      };
    });
    const remote = mapped.filter(isCity);
    return [...presets, ...remote]
      .filter(
        (city, i, all) =>
          !all
            .slice(0, i)
            .some(
              (c) =>
                c.name.toLowerCase() === city.name.toLowerCase() &&
                Math.abs(c.lat - city.lat) < 0.12 &&
                Math.abs(c.lon - city.lon) < 0.12,
            ),
      )
      .slice(0, 8);
  } catch {
    return presets;
  }
}
