import { getImpact } from './impact.js';
import { normalizeProfile } from './profile.js';

export const sources = {
  data: {
    title: 'Open-Meteo · CAMS air forecasts',
    url: 'https://open-meteo.com/en/docs/air-quality-api',
  },
  activity: {
    title: 'AirNow · Particle pollution guide',
    url: 'https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf',
  },
  indoor: {
    title: 'EPA · Indoor particle sources',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/sources-indoor-particulate-matter-pm',
  },
  filter: {
    title: 'EPA · Guide to air cleaners',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
  },
  travel: {
    title: 'EPA · Typical passenger vehicle',
    url: 'https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle',
  },
  bus: {
    title: 'EPA · Fuel emission factors',
    url: 'https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references',
  },
  idling: {
    title: 'EPA · School idle reduction',
    url: 'https://www.epa.gov/dera/school-bus-idle-reduction',
  },
  mask: {
    title: 'CDC · Air quality and particle respirators',
    url: 'https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/air-quality-and-ionizing-radiation-during-travel.html',
  },
  index: { title: 'AirNow · US AQI categories', url: 'https://www.airnow.gov/aqi/aqi-basics/' },
};

function activityGuidance(aqi, group) {
  const who = {
    family: 'Children',
    adults: 'Adults',
    seniors: 'Older adults',
    sensitive: 'Sensitive household members',
  }[group];
  if (aqi > 300)
    return 'Everyone should avoid outdoor physical activity. Move plans to cleaner indoor air and follow local alerts.';
  if (aqi > 200)
    return group === 'adults'
      ? 'Move long or vigorous workouts indoors. Keep necessary outdoor activity brief and gentle.'
      : who +
          ' should avoid outdoor physical activity. Move exercise and play into a cleaner indoor space.';
  if (aqi > 150)
    return group === 'adults'
      ? 'Shorten strenuous outdoor activity, slow the pace and take more breaks.'
      : who + ' should avoid long or intense outdoor activity. Choose gentler indoor movement.';
  if (aqi > 100)
    return group === 'adults'
      ? 'Check the local advisory before a long outdoor workout, especially if anyone is unusually sensitive.'
      : who + ' can shorten outdoor activity, reduce intensity and take extra breaks.';
  if (aqi > 50)
    return 'Most people can keep their routine. Anyone unusually sensitive can shorten heavy outdoor effort if needed.';
  return 'Usual outdoor activities are reasonable at this AQI. Pick a route away from busy traffic when possible.';
}

function fact(id, group, title, action, impact, source) {
  return { id, group, title, action, impact, sourceUrl: source.url, sourceTitle: source.title };
}

export function actionCatalog(air, p) {
  const poor = air.aqi > 100;
  const severe = air.aqi > 200;
  const active = ['walk', 'cycle'].includes(p.commute);
  const lowest = air.hours.reduce((best, h) => (!best || h.aqi < best.aqi ? h : best), null);
  const lowHour = lowest ? lowest.time.slice(11, 16) : '';
  const later = lowest?.time.slice(0, 10) !== air.asOf.slice(0, 10) ? ' the next day' : '';
  const forecastText = lowest
    ? 'The lowest US AQI in the displayed forecast is ' +
      lowest.aqi +
      ' at ' +
      lowHour +
      later +
      ' (city time). '
    : '';
  const timingAdvice =
    lowest?.aqi > 150
      ? 'Keep strenuous activity indoors even in that window.'
      : 'Check the local advisory again before moving an errand to that hour.';
  const emissions = getImpact(p.distanceKm, 'carpool');
  let travelChoice;
  if (active)
    travelChoice = poor
      ? 'Postpone the ' +
        (p.commute === 'cycle' ? 'bike ride' : 'walk') +
        ' or take enclosed shared transport for essential travel today.'
      : 'Keep your active commute and use a quieter side street when one is available.';
  else if (p.commute === 'transit')
    travelChoice =
      'Time your trip for a shorter wait. Stand back from idling vehicles and busy kerbs.';
  else
    travelChoice =
      'Share the ' +
      p.distanceKm +
      ' km trip with another driver going the same way, or combine errands into one outing.';
  const activityTitle = severe
    ? 'Move activity indoors'
    : poor
      ? 'Dial back outdoor effort'
      : 'Choose your outdoor route';
  return {
    activity: fact(
      'activity',
      'Routine',
      activityTitle,
      activityGuidance(air.aqi, p.household),
      'Time outdoors and breathing rate both affect how many particles you inhale.',
      sources.activity,
    ),
    time: fact(
      'time',
      'Routine',
      'Find a lower-exposure hour',
      forecastText + timingAdvice,
      'Shifting a necessary trip can reduce exposure when pollution is lower. Citywide forecasts can miss local traffic.',
      sources.data,
    ),
    travel: fact(
      'travel',
      'Routine',
      p.commute === 'car' ? 'Share one journey' : 'Rethink the commute',
      travelChoice,
      p.commute === 'car'
        ? 'Sharing equally would avoid about ' +
            emissions.kg.toFixed(2) +
            ' kg of tailpipe CO₂ per traveler versus driving alone, assuming two riders and no detour.'
        : 'A shorter wait beside traffic limits time around exhaust. Sharing an existing ride can also avoid a separate car trip.',
      sources.travel,
    ),
    cook: fact(
      'cook',
      'Indoors',
      'Keep the kitchen low-smoke',
      'Steam or simmer a meal instead of frying. Use a hood that vents outdoors when cooking, especially with gas.',
      'Lower-heat cooking can release fewer particles. An externally vented hood carries cooking pollution outside.',
      sources.indoor,
    ),
    dust: fact(
      'dust',
      'Indoors',
      'Start with a no-cost change',
      'Skip incense and candles today. Wipe dusty surfaces with a damp cloth instead of sweeping them dry.',
      'Avoiding combustion cuts particles at their source. Damp cleaning keeps more settled dust from returning to the air.',
      sources.indoor,
    ),
    window: fact(
      'window',
      'Indoors',
      poor ? 'Time your ventilation' : 'Air out thoughtfully',
      poor
        ? 'During a particle spike, limit open windows if indoor temperature stays comfortable. Air out when outdoor conditions improve. Keep necessary exhaust and appliance ventilation operating.'
        : 'If outdoor conditions are good and the weather permits, open windows briefly to air out the room. Keep cooking exhaust operating.',
      'Outdoor air can dilute indoor pollutants when clean, or carry particles inside during smog.',
      sources.indoor,
    ),
    filter: fact(
      'filter',
      'Indoors',
      'Set up one cleaner room',
      'Choose the room your household uses most. If available, run a room-sized HEPA cleaner that does not generate ozone.',
      'A correctly sized filter captures airborne particles in that space. Actual removal depends on airflow, filter condition and room size.',
      sources.filter,
    ),
    mask: fact(
      'mask',
      'Routine',
      'Reduce particle exposure on essential trips',
      'Adults who must go out can use a well-fitting NIOSH-approved particulate respirator such as an N95. For children, prioritise cleaner indoor air; adult respirators may not fit their faces.',
      'The seal and filter reduce the particles you inhale. A particulate respirator does not filter gases or make strenuous outdoor activity safe during severe smog.',
      sources.mask,
    ),
    school: fact(
      'school',
      'Community',
      'Make pickup idle-free',
      'Ask drivers at the pickup point to turn off parked engines when safe. Move the waiting area away from exhaust.',
      'Switching off engines during the wait removes that source of exhaust where people gather.',
      sources.idling,
    ),
    checkin: fact(
      'checkin',
      'Community',
      'Check in with a neighbour',
      'Offer to collect an essential item for an older neighbour on a trip you already have planned. Share the current local advisory.',
      'Combining errands can avoid an extra vehicle journey and spare someone a trip through polluted air.',
      sources.activity,
    ),
    explain: fact(
      'explain',
      'Routine',
      'Read the air index',
      'US AQI reports the highest pollutant-specific index. PM2.5 refers to airborne particles 2.5 micrometres across or smaller. The dashboard shows their concentration in µg/m³. The outdoor model cannot measure your indoor air.',
      'The category helps you choose a level of outdoor exertion. PM2.5 and the AQI use different units.',
      sources.index,
    ),
  };
}

export function getPlan(air, profile = {}) {
  const p = normalizeProfile(profile);
  const facts = actionCatalog(air, p);
  return [
    facts.activity,
    facts.travel,
    air.aqi > 150 ? facts.filter : facts.cook,
    facts.dust,
    p.household === 'family' ? facts.school : facts.checkin,
  ];
}

export function sourceLabel(source) {
  return (
    {
      live: 'modeled forecast',
      cached: 'cached modeled forecast',
      demo: 'illustrative winter scenario',
    }[source] || 'forecast'
  );
}

export function getCommunityBrief(air, profile = {}) {
  const p = normalizeProfile(profile);
  const facts = actionCatalog(air, p);
  return [
    'Airshed · ' + air.city.name + ' · ' + sourceLabel(air.source),
    air.asOf.replace('T', ' ') +
      ' city time · US AQI ' +
      air.aqi +
      ' (' +
      air.category.label +
      ').',
    activityGuidance(air.aqi, p.household),
    facts.cook.action,
    facts.school.action,
    'Before going out, check the latest local advisory. Guidance: ' + sources.activity.url,
  ].join('\n\n');
}
