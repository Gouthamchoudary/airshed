import { fetchJSON } from '../lib/http.js';
import { readJSON, writeJSON } from '../lib/storage.js';
import { cities, isCity } from './geography.js';

const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CACHE_MAX_AGE_MS = 6 * 60 * 60_000;
const CACHE_REFRESH_MS = 5 * 60_000;
const HOUR_LIMIT = 24;

export function categoryFor(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return { label: 'Unavailable', color: '#6a7870' };
  const categories = [
    [50, 'Good', '#197859'],
    [100, 'Moderate', '#9d7308'],
    [150, 'Unhealthy for sensitive groups', '#c95b17'],
    [200, 'Unhealthy', '#b43840'],
    [300, 'Very unhealthy', '#854d87'],
    [Infinity, 'Hazardous', '#79264c'],
  ];
  const [, label, color] = categories.find(([max]) => aqi <= max);
  return { label, color };
}

const isReading = (value) => Number.isFinite(value) && value >= 0;
const isHour = (hour) =>
  typeof hour?.time === 'string' && isReading(hour.aqi) && isReading(hour.pm25);

// A repeatable, synthetic planning exercise. These are local wall-clock strings,
// never parsed as the user's computer timezone. No measured data are implied.
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

function readForecastCache(key, now) {
  const entry = readJSON(key);
  if (!entry) return null;
  const { savedAt, air } = entry;
  const age = now - savedAt;
  if (
    !Number.isFinite(savedAt) ||
    age < 0 ||
    age >= CACHE_MAX_AGE_MS ||
    air?.source !== 'live' ||
    !isCity(air.city) ||
    typeof air.asOf !== 'string' ||
    !isReading(air.aqi) ||
    !isReading(air.pm25) ||
    !isReading(air.pm10) ||
    !Array.isArray(air.hours)
  )
    return null;

  try {
    const currentHour = cityHour(now, air.timezone);
    const hours = air.hours.filter((hour) => isHour(hour) && hour.time >= currentHour);
    // Keep an older current reading timestamped. Only suggest hours in the future.
    return hours.length ? { age, air: { ...air, hours, category: categoryFor(air.aqi) } } : null;
  } catch {
    return null;
  }
}

function parseForecast(data, city) {
  const { current, hourly } = data ?? {};
  if (
    !isReading(current?.us_aqi) ||
    !isReading(current.pm2_5) ||
    !isReading(current.pm10) ||
    typeof current.time !== 'string' ||
    !Array.isArray(hourly?.time)
  ) {
    throw new Error('Incomplete forecast');
  }
  const start = current.time.slice(0, 13) + ':00';
  const hours = hourly.time
    .map((time, index) => ({
      time,
      aqi: hourly.us_aqi?.[index],
      pm25: hourly.pm2_5?.[index],
    }))
    .filter((hour) => isHour(hour) && hour.time >= start)
    .slice(0, HOUR_LIMIT)
    .map((hour) => ({ ...hour, aqi: Math.round(hour.aqi) }));
  if (!hours.length) throw new Error('No hourly forecast');

  const aqi = Math.round(current.us_aqi);
  return {
    city,
    source: 'live',
    asOf: current.time,
    timezone: data.timezone || city.timezone || 'UTC',
    aqi,
    pm25: current.pm2_5,
    pm10: current.pm10,
    hours,
    category: categoryFor(aqi),
  };
}

export async function getAir(city = cities[0], { demo = false, signal } = {}) {
  if (!isCity(city)) throw new TypeError('Choose a city with valid coordinates.');
  if (demo) return getDemoAir(city);

  const key = `airshed.forecast.v1.${city.lat.toFixed(3)},${city.lon.toFixed(3)}`;
  const cached = readForecastCache(key, Date.now());
  if (cached && cached.age < CACHE_REFRESH_MS) return { ...cached.air, source: 'cached', city };

  const params = new URLSearchParams({
    latitude: city.lat,
    longitude: city.lon,
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
