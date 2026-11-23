import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cities,
  categoryFor,
  getDemoAir,
  getAir,
  searchCities,
  getPlan,
  getImpact,
  getCommunityBrief,
  askAssistant,
} from '../engine.js';
import { decodeActions } from './planner.js';

const demo = getDemoAir();
const family = { household: 'family', commute: 'car', distanceKm: 8 };
const today = new Date();
today.setUTCHours(today.getUTCHours(), 0, 0, 0);
const localHour = (offset) =>
  new Date(today.getTime() + offset * 3600000).toISOString().slice(0, 16);
const payload = () => ({
  current: { time: localHour(0), us_aqi: 154, pm2_5: 57.4, pm10: 68.1 },
  hourly: {
    time: [localHour(-1), localHour(0), localHour(1)],
    us_aqi: [164, 154, 151],
    pm2_5: [62, 57, 55],
  },
  timezone: 'UTC',
});

test('every category boundary uses the US AQI scale; no reading stays unavailable', () => {
  for (const [value, label] of [
    [0, 'Good'],
    [50, 'Good'],
    [51, 'Moderate'],
    [100, 'Moderate'],
    [101, 'Unhealthy for sensitive groups'],
    [150, 'Unhealthy for sensitive groups'],
    [151, 'Unhealthy'],
    [200, 'Unhealthy'],
    [201, 'Very unhealthy'],
    [300, 'Very unhealthy'],
    [301, 'Hazardous'],
    [730, 'Hazardous'],
    [null, 'Unavailable'],
  ])
    assert.equal(categoryFor(value).label, label);
});

test('winter exercise stays clearly synthetic across midnight and cities', () => {
  const second = getDemoAir(cities[9]);
  assert.equal(second.source, 'demo');
  assert.equal(second.city, cities[9]);
  assert.equal(second.hours.length, 24);
  assert.equal(second.hours[0].aqi, second.aqi);
  assert.ok(second.hours.every((h, i, a) => i === 0 || a[i - 1].time < h.time));
  assert.match(getCommunityBrief(second), /illustrative winter scenario/);
  assert.match(getCommunityBrief(second), /city time/);
});

test('data flow tries the real endpoint, caches valid data, then handles incomplete data', async (t) => {
  const storage = new Map();
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).hostname, 'air-quality-api.open-meteo.com');
    return Response.json(payload());
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  });
  t.after(() => delete globalThis.localStorage);
  const first = await getAir(cities[0]);
  assert.equal(first.source, 'live');
  assert.equal(first.hours.length, 2);
  assert.equal(first.aqi, 154);
  assert.equal((await getAir(cities[0])).source, 'cached');
  assert.equal(globalThis.fetch.mock.callCount(), 1);

  const [key, raw] = [...storage.entries()][0];
  const old = JSON.parse(raw);
  old.savedAt -= 10 * 60000;
  old.air.category = null;
  storage.set(key, JSON.stringify(old));
  globalThis.fetch.mock.mockImplementation(async () =>
    Response.json({ current: { us_aqi: null } }),
  );
  const refreshedCache = await getAir(cities[0]);
  assert.equal(refreshedCache.source, 'cached');
  assert.equal(refreshedCache.category.label, 'Unhealthy');
  storage.clear();
  const fallback = await getAir(cities[0]);
  assert.equal(fallback.source, 'demo');
  assert.match(fallback.scenarioReason, /unavailable/);
});

test('invalid geography fails before running a data request; demo needs no network', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw Error('Should not request network');
  });
  await assert.rejects(getAir({ name: 'Bad latitude', lat: 95, lon: 8 }), TypeError);
  assert.equal((await getAir(cities[0], { demo: true })).source, 'demo');
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('geocoder encodes user text, retains country and region, and deduplicates presets', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('name'), 'New Delhi');
    return Response.json({
      results: [
        { name: 'New Delhi', country: 'India', latitude: 28.61, longitude: 77.21 },
        { name: 'New Delhi', country: 'Example', admin1: 'North', latitude: 34, longitude: 82 },
      ],
    });
  });
  const found = await searchCities('New Delhi');
  assert.equal(found.length, 2);
  assert.equal(found[1].region, 'North');
  globalThis.fetch.mock.mockImplementation(async () => {
    throw Error('offline');
  });
  assert.equal((await searchCities('Warangal'))[0].name, 'Warangal');
});

test('personalized daily plan changes with sensitivity, travel and local conditions', () => {
  for (const aqi of [42, 89, 118, 166, 238, 380]) {
    const air = { ...demo, aqi, category: categoryFor(aqi) };
    const plan = getPlan(air, { household: 'seniors', commute: 'cycle' });
    assert.equal(new Set(plan.map((x) => x.group)).size, 3);
    assert.ok(plan.every((x) => x.action && x.impact && /^https:\/\//.test(x.sourceUrl)));
    if (aqi > 200) assert.match(plan[0].action, /avoid outdoor physical activity/i);
    if (aqi > 100) assert.match(plan[1].action, /Postpone/);
  }
  assert.match(getPlan(demo, family)[1].action, /8 km/);
  assert.match(getPlan(demo, { ...family, household: 'seniors' }).at(-1).action, /neighbour/);
});

test('tailpipe estimates distinguish occupancy and modes; the low hour can still be unhealthy', async () => {
  const solo = getImpact(10, 'walk');
  const shared = getImpact(10, 'carpool');
  assert.equal(solo.kg, 2.49);
  assert.equal(shared.kg, 1.24);
  assert.equal(getImpact(10, 'cycle', 5).kg, 12.43);
  assert.equal(getImpact(-2, 'transit').kg, 0);
  assert.ok(getImpact(10, 'transit').alternativeKg > 0);
  assert.match(getImpact(10, 'transit').assumption, /15 passengers/);
  const answer = await askAssistant('What time should I reschedule the errands?', demo, family);
  assert.match(answer.text, /164 at 16:00/);
  assert.match(answer.text, /indoors even in that window/);
});

test('held-out phrasings lead the decoder to appropriate next actions', () => {
  const cases = [
    ['Can my daughter play cricket outside?', 'activity'],
    ['Should we open the windows in my flat?', 'window'],
    ['I cannot buy an air purifier', 'dust'],
    ['How do we coordinate school pickup as neighbours?', 'school'],
    ['Could we share a car for our commute?', 'travel'],
    ['What time should I reschedule the errands?', 'time'],
    ['My dinner makes the kitchen smoky, what can I change?', 'cook'],
    ['Does a HEPA purifier remove particles from my room?', 'filter'],
    ['Explain PM2.5 in plain language', 'explain'],
  ];
  for (const [question, expected] of cases) {
    const decoded = decodeActions(question, 238, family);
    assert.equal(decoded[0], expected, question);
    assert.equal(new Set(decoded).size, decoded.length);
  }
});

test('online AI requires opt-in and handles service failures and valid Gemini replies', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/brief');
    const sent = JSON.parse(options.body);
    assert.equal(sent.source, 'demo');
    assert.equal(sent.city, 'New Delhi');
    assert.equal(sent.actions[0].title, 'Time your ventilation');
    assert.equal(sent.aqi, 238);
    assert.ok(!('lat' in sent) && !('lon' in sent));
    return Response.json({
      text: 'Keep the windows closed through the spike when comfortable.',
      mode: 'Gemini 2.5 Flash-Lite',
    });
  });
  const offline = await askAssistant('When should I open windows?', demo, family);
  assert.equal(offline.mode, 'local');
  assert.equal(mock.mock.callCount(), 0);
  const online = await askAssistant('When should I open windows?', demo, family, { cloud: true });
  assert.equal(online.mode, 'cloud');
  assert.ok(online.sources.length);
  assert.match(online.text, /illustrative winter scenario/);
  mock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  const backup = await askAssistant('When should I open windows?', demo, family, { cloud: true });
  assert.equal(backup.mode, 'local');
  assert.match(backup.label, /Cloud unavailable/);
});

test('medical and unrelated questions are routed before AI; questions about children get protective guidance', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', () => {
    throw Error('Should stay local');
  });
  assert.match(
    (await askAssistant('I cannot breathe', demo, family, { cloud: true })).text,
    /urgent/i,
  );
  assert.match(
    (await askAssistant('What dose of medicine?', demo, family, { cloud: true })).text,
    /clinician/,
  );
  assert.equal(
    (await askAssistant('Who wrote Hamlet?', demo, family, { cloud: true })).mode,
    'guide',
  );
  assert.equal(mock.mock.callCount(), 0);
  assert.match(
    (await askAssistant('Can my children play outside?', demo, { household: 'adults' })).text,
    /Children should avoid/,
  );
});

test('an unknown mode uses the transit baseline even when it matches an inherited property', () => {
  for (const mode of ['unknown', 'constructor', '__proto__']) {
    assert.deepEqual(getImpact(12, mode), getImpact(12, 'transit'));
  }
});

test('invalid provider dates and timezones fall back to the labeled exercise', async (t) => {
  let current = payload();
  t.mock.method(globalThis, 'fetch', async () => Response.json(current));
  for (const invalid of [
    { ...payload(), timezone: 'Not/AZone' },
    { ...payload(), current: { ...payload().current, time: '2026-02-30T12:00' } },
  ]) {
    current = invalid;
    const fallback = await getAir(cities[0]);
    assert.equal(fallback.source, 'demo');
    assert.match(fallback.scenarioReason, /unavailable/);
  }
});

test('valid forecast hours are sorted and duplicate timestamps are removed', async (t) => {
  const result = payload();
  result.hourly = {
    time: [localHour(2), localHour(0), localHour(1), localHour(1), 'not-a-time'],
    us_aqi: [165, 154, 149, 151, 1],
    pm2_5: [62, 57, 54, 55, 1],
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json(result));
  const forecast = await getAir(cities[0]);
  assert.equal(forecast.source, 'live');
  assert.deepEqual(
    forecast.hours.map((hour) => hour.time),
    [localHour(0), localHour(1), localHour(2)],
  );
  assert.deepEqual(
    forecast.hours.map((hour) => hour.aqi),
    [154, 151, 165],
  );
});
