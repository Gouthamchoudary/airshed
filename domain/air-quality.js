import { nonEmptyString, nonNegativeNumber, record } from '../lib/data.js';
import { fetchJSON } from '../lib/http.js';
import { readJSON, writeJSON } from '../lib/storage.js';
import { cities, isCity } from './geography.js';

const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CACHE_MAX_AGE_MS = 6 * 60 * 60_000;
const CACHE_REFRESH_MS = 5 * 60_000;
const HOUR_LIMIT = 24;

/** @typedef {import('../types/contracts.js').AirForecast} AirForecast */
/** @typedef {import('../types/contracts.js').AirHour} AirHour */
/** @typedef {import('../types/contracts.js').City} City */

/** @param {unknown} aqi */
export function categoryFor(aqi) {
  if (!nonNegativeNumber(aqi)) return { label: 'Unavailable', color: '#6a7870' };
  /** @type {[number, string, string][]} */
  const categories = [
    [50, 'Good', '#197859'],
    [100, 'Moderate', '#9d7308'],
    [150, 'Unhealthy for sensitive groups', '#c95b17'],
    [200, 'Unhealthy', '#b43840'],
    [300, 'Very unhealthy', '#854d87'],
    [Infinity, 'Hazardous', '#79264c'],
  ];
  const [, label, color] = categories.find(([max]) => aqi <= max) ?? [
    Infinity,
    'Hazardous',
    '#79264c',
  ];
  return { label, color };
}

/**
 * Times are city wall-clock values. Round-trip using UTC to validate the
 * calendar without shifting the time to the user's device timezone.
 * @param {unknown} value
 * @returns {value is string}
 */
function isLocalTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value + 'Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

/** @param {unknown} hour @returns {hour is AirHour} */
function isHour(hour) {
  const { time, aqi, pm25 } = record(hour);
  return isLocalTimestamp(time) && nonNegativeNumber(aqi) && nonNegativeNumber(pm25);
}

/** @param {unknown} value @returns {value is string} */
function isTimeZone(value) {
  if (!nonEmptyString(value)) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** @param {AirHour[]} hours @param {string} from */
function upcomingHours(hours, from) {
  return [
    ...new Map(hours.filter((hour) => hour.time >= from).map((hour) => [hour.time, hour])).values(),
  ]
    .sort((first, second) => first.time.localeCompare(second.time))
    .slice(0, HOUR_LIMIT);
}

// A repeatable, synthetic planning exercise. These are local wall-clock strings,
// never parsed as the user's computer timezone. No measured data are implied.
/** @param {City} city @returns {AirForecast} */
export function getDemoAir(city = cities[0]) {
  const curve = [
    238, 243, 240, 229, 215, 197, 183, 171, 164, 168, 181, 203, 224, 241, 255, 264, 260, 250, 244,
    238, 235, 240, 249, 246,
  ];
  const hours = curve.map((aqi, index) => {
    const hour = (index + 8) % 24;
    const date = index < 16 ? '2025-01-15' : '2025-01-16';
    // Illustrative PM2.5 is consistent with the 2024 US EPA PM2.5 breakpoints.
    const pm25 = aqi > 200 ? 125.5 + ((aqi - 201) * 99.9) / 99 : 55.5 + ((aqi - 151) * 69.9) / 49;
    return {
      time: date + 'T' + String(hour).padStart(2, '0') + ':00',
      aqi,
      pm25: Math.round(pm25),
    };
  });
  return {
    city,
    source: 'demo',
    asOf: hours[0].time,
    timezone: city.timezone || 'UTC',
    aqi: 238,
    pm25: 162,
    pm10: 236,
    hours,
    category: categoryFor(238),
    scenarioReason: 'Illustrative winter-smog exercise',
  };
}

/** @param {number} timestamp @param {string} timeZone */
function cityHour(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const { year, month, day, hour } = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${year}-${month}-${day}T${hour}:00`;
}

/**
 * @param {string} key
 * @param {number} now
 * @returns {{ age: number; air: AirForecast } | null}
 */
function readForecastCache(key, now) {
  const { savedAt, air } = record(readJSON(key));
  if (!nonNegativeNumber(savedAt)) return null;
  const age = now - savedAt;
  if (age < 0 || age >= CACHE_MAX_AGE_MS) return null;

  const { city, source, asOf, timezone, aqi, pm25, pm10, hours: storedHours } = record(air);
  if (
    source !== 'live' ||
    !isCity(city) ||
    !isLocalTimestamp(asOf) ||
    !isTimeZone(timezone) ||
    !nonNegativeNumber(aqi) ||
    !nonNegativeNumber(pm25) ||
    !nonNegativeNumber(pm10) ||
    !Array.isArray(storedHours)
  )
    return null;
  // Keep the older reading timestamped and exclude hours already in the past.
  const hours = upcomingHours(storedHours.filter(isHour), cityHour(now, timezone));
  return hours.length
    ? {
        age,
        air: { city, source, asOf, timezone, aqi, pm25, pm10, hours, category: categoryFor(aqi) },
      }
    : null;
}

/** @param {unknown} data @param {City} city @returns {AirForecast} */
function parseForecast(data, city) {
  const { current, hourly, timezone } = record(data);
  const { time, us_aqi, pm2_5: pm25, pm10 } = record(current);
  const { time: timePoints, us_aqi: aqiPoints, pm2_5: pm25Points } = record(hourly);
  if (
    !isLocalTimestamp(time) ||
    !nonNegativeNumber(us_aqi) ||
    !nonNegativeNumber(pm25) ||
    !nonNegativeNumber(pm10) ||
    !Array.isArray(timePoints) ||
    !Array.isArray(aqiPoints) ||
    !Array.isArray(pm25Points) ||
    !isTimeZone(timezone)
  )
    throw new Error('Incomplete forecast');

  const start = time.slice(0, 13) + ':00';
  const hours = upcomingHours(
    timePoints
      .map((localTime, index) => ({
        time: localTime,
        aqi: aqiPoints[index],
        pm25: pm25Points[index],
      }))
      .filter(isHour),
    start,
  ).map((hour) => ({ ...hour, aqi: Math.round(hour.aqi) }));
  if (!hours.length) throw new Error('No hourly forecast');

  const aqi = Math.round(us_aqi);
  return {
    city,
    source: 'live',
    asOf: time,
    timezone,
    aqi,
    pm25,
    pm10,
    hours,
    category: categoryFor(aqi),
  };
}

/**
 * @param {City} city
 * @param {{demo?: boolean, signal?: AbortSignal}} options
 * @returns {Promise<AirForecast>}
 */
export async function getAir(city = cities[0], { demo = false, signal } = {}) {
  if (!isCity(city)) throw new TypeError('Choose a city with valid coordinates.');
  if (demo) return getDemoAir(city);

  const key = `airshed.forecast.v1.${city.lat.toFixed(3)},${city.lon.toFixed(3)}`;
  const cached = readForecastCache(key, Date.now());
  if (cached && cached.age < CACHE_REFRESH_MS) return { ...cached.air, source: 'cached', city };

  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    timezone: 'auto',
    forecast_days: '3',
    current: 'us_aqi,pm2_5,pm10',
    hourly: 'us_aqi,pm2_5',
  });
  try {
    const data = await fetchJSON(`${AIR_QUALITY_URL}?${params}`, 5000, { signal });
    const air = parseForecast(data, city);
    writeJSON(key, { savedAt: Date.now(), air });
    return air;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (cached)
      return {
        ...cached.air,
        source: 'cached',
        city,
        scenarioReason: 'Last successful model update',
      };
    return {
      ...getDemoAir(city),
      scenarioReason: 'Live data unavailable · illustrative winter-smog exercise',
    };
  }
}
