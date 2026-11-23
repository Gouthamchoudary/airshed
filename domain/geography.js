import { fetchJSON } from '../lib/http.js';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';

export const cities = [
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
].map(([name, country, lat, lon, timezone]) => ({ name, country, lat, lon, timezone }));

export const isCity = (c) =>
  Boolean(c) &&
  typeof c.name === 'string' &&
  c.name.trim().length > 0 &&
  Number.isFinite(c.lat) &&
  Math.abs(c.lat) <= 90 &&
  Number.isFinite(c.lon) &&
  Math.abs(c.lon) <= 180;

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
    const json = await fetchJSON(GEO + '?' + params, 3500, { signal });
    const remote = (Array.isArray(json?.results) ? json.results : [])
      .filter(Boolean)
      .map((r) => ({
        name: r.name,
        country: r.country || r.country_code || '',
        region: r.admin1 || '',
        lat: r.latitude,
        lon: r.longitude,
        timezone: r.timezone || 'UTC',
      }))
      .filter(isCity);
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
