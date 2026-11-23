import {decodeActions} from './genai/planner.js';

export const cities = [
  ['New Delhi','India',28.614,77.209,'Asia/Kolkata'],
  ['Mumbai','India',19.076,72.878,'Asia/Kolkata'],
  ['Bengaluru','India',12.972,77.595,'Asia/Kolkata'],
  ['Hyderabad','India',17.385,78.487,'Asia/Kolkata'],
  ['Panaji','India',15.498,73.827,'Asia/Kolkata'],
  ['Warangal','India',17.969,79.594,'Asia/Kolkata'],
  ['Kolkata','India',22.573,88.364,'Asia/Kolkata'],
  ['Chennai','India',13.083,80.271,'Asia/Kolkata'],
  ['Lucknow','India',26.847,80.946,'Asia/Kolkata'],
  ['Lahore','Pakistan',31.550,74.344,'Asia/Karachi'],
  ['Dhaka','Bangladesh',23.810,90.413,'Asia/Dhaka'],
  ['Kathmandu','Nepal',27.717,85.324,'Asia/Kathmandu'],
  ['Beijing','China',39.904,116.407,'Asia/Shanghai'],
  ['London','United Kingdom',51.507,-0.128,'Europe/London'],
  ['New York','United States',40.713,-74.006,'America/New_York'],
  ['Los Angeles','United States',34.052,-118.244,'America/Los_Angeles'],
].map(([name,country,lat,lon,timezone]) => ({name,country,lat,lon,timezone}));

export const sources = {
  data:{title:'Open-Meteo · CAMS air forecasts',url:'https://open-meteo.com/en/docs/air-quality-api'},
  activity:{title:'AirNow · Particle pollution guide',url:'https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf'},
  indoor:{title:'EPA · Indoor particle sources',url:'https://www.epa.gov/indoor-air-quality-iaq/sources-indoor-particulate-matter-pm'},
  filter:{title:'EPA · Guide to air cleaners',url:'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home'},
  travel:{title:'EPA · Typical passenger vehicle',url:'https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle'},
  bus:{title:'EPA · Fuel emission factors',url:'https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references'},
  idling:{title:'EPA · School idle reduction',url:'https://www.epa.gov/dera/school-bus-idle-reduction'},
  mask:{title:'CDC · Air quality and particle respirators',url:'https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/air-quality-and-ionizing-radiation-during-travel.html'},
  index:{title:'AirNow · US AQI categories',url:'https://www.airnow.gov/aqi/aqi-basics/'},
};

export function categoryFor(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return {label:'Unavailable',color:'#6a7870'};
  const categories = [
    [50,'Good','#197859'], [100,'Moderate','#9d7308'],
    [150,'Unhealthy for sensitive groups','#c95b17'], [200,'Unhealthy','#b43840'],
    [300,'Very unhealthy','#854d87'], [Infinity,'Hazardous','#79264c'],
  ];
  const [,label,color] = categories.find(([max]) => aqi <= max);
  return {label,color};
}

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const ONE_HOUR = 3_600_000;
const validNumber = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const validCity = c => c && typeof c.name === 'string' && c.name.trim().length > 0 &&
  Number.isFinite(c.lat) && Math.abs(c.lat) <= 90 && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180;

async function fetchJSON(url, timeout = 5000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {...options, signal:controller.signal});
    if (!response.ok) throw new Error('Service unavailable');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchCities(query) {
  const term = String(query || '').trim().slice(0, 100);
  if (!term) return cities.slice(0, 6);
  const lower = term.toLowerCase();
  const presetTerm = ['goa', 'panjim', 'panaji goa'].includes(lower) ? 'panaji' : lower;
  const presets = cities.filter(city => city.name.toLowerCase().includes(presetTerm));
  if (term.length < 2) return presets;
  const params = new URLSearchParams({name:term, count:'8', language:'en', format:'json'});
  try {
    const json = await fetchJSON(GEO + '?' + params, 3500);
    const remote = (json.results || []).map(r => ({
      name:r.name, country:r.country || r.country_code || '', region:r.admin1 || '',
      lat:r.latitude, lon:r.longitude, timezone:r.timezone || 'UTC',
    })).filter(validCity);
    return [...presets, ...remote].filter((city, i, all) => !all.slice(0, i).some(c =>
      c.name.toLowerCase() === city.name.toLowerCase() && Math.abs(c.lat-city.lat) < 0.12 &&
      Math.abs(c.lon-city.lon) < 0.12)).slice(0, 8);
  } catch {
    return presets;
  }
}

// A repeatable, synthetic planning exercise. These are local wall-clock strings,
// never parsed as the user's computer timezone. No measured data are implied.
export function getDemoAir(city = cities[0]) {
  const curve = [238,243,240,229,215,197,183,171,164,168,181,203,
                 224,241,255,264,260,250,244,238,235,240,249,246];
  const hours = curve.map((aqi, index) => {
    const hour = (index + 8) % 24;
    const date = index < 16 ? '2025-01-15' : '2025-01-16';
    // Illustrative PM2.5 is consistent with the 2024 US EPA PM2.5 breakpoints.
    const pm25 = aqi > 200 ? 125.5 + (aqi-201)*99.9/99 : 55.5 + (aqi-151)*69.9/49;
    return {time:date + 'T' + String(hour).padStart(2,'0') + ':00', aqi, pm25:Math.round(pm25)};
  });
  return {
    city, source:'demo', asOf:hours[0].time, timezone:city.timezone || 'UTC',
    aqi:238, pm25:162, pm10:236, hours, category:categoryFor(238),
    scenarioReason:'Illustrative winter-smog exercise',
  };
}

function storedForecast(key) {
  try {
    const entry = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
    if (entry && Number.isFinite(entry.savedAt) && Date.now() >= entry.savedAt &&
        Date.now()-entry.savedAt < 6*ONE_HOUR && validNumber(entry.air?.aqi) &&
        validNumber(entry.air.pm25) && validNumber(entry.air.pm10) && validCity(entry.air.city) &&
        entry.air.source === 'live' && typeof entry.air.asOf === 'string' &&
        Array.isArray(entry.air.hours) && entry.air.hours.length) {
      // The original "current" value remains timestamped as cached. Never
      // recommend a past forecast hour while using an older local snapshot.
      const parts = new Intl.DateTimeFormat('en-GB',{timeZone:entry.air.timezone,
        year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
      const clock = Object.fromEntries(parts.map(p => [p.type,p.value]));
      const currentHour = clock.year+'-'+clock.month+'-'+clock.day+'T'+clock.hour+':00';
      entry.air.hours = entry.air.hours.filter(h => typeof h?.time === 'string' &&
        h.time >= currentHour && validNumber(h.aqi) && validNumber(h.pm25));
      if (entry.air.hours.length) return entry;
    }
  } catch { /* Storage is optional on privacy-restricted devices. */ }
  return null;
}

export async function getAir(city = cities[0], {demo = false} = {}) {
  if (!validCity(city)) throw new TypeError('Choose a city with valid coordinates.');
  if (demo) return getDemoAir(city);
  const key = 'airshed.forecast.v1.' + city.lat.toFixed(3) + ',' + city.lon.toFixed(3);
  const cached = storedForecast(key);
  if (cached && Date.now()-cached.savedAt < 5*60_000) return {...cached.air, source:'cached',city};
  const params = new URLSearchParams({
    latitude:city.lat, longitude:city.lon, timezone:'auto', forecast_days:'3',
    current:'us_aqi,pm2_5,pm10', hourly:'us_aqi,pm2_5',
  });
  try {
    const data = await fetchJSON(AIR + '?' + params);
    const current = data.current;
    if (!validNumber(current?.us_aqi) || !validNumber(current.pm2_5) || !validNumber(current.pm10) ||
        typeof current.time !== 'string' || !Array.isArray(data.hourly?.time)) throw new Error('Incomplete forecast');
    const start = current.time.slice(0,13) + ':00';
    const hours = data.hourly.time.map((time, index) => ({
      time, aqi:data.hourly.us_aqi?.[index], pm25:data.hourly.pm2_5?.[index],
    })).filter(h => typeof h.time === 'string' && h.time >= start && validNumber(h.aqi) && validNumber(h.pm25))
      .slice(0,24).map(h => ({...h, aqi:Math.round(h.aqi)}));
    if (!hours.length) throw new Error('No hourly forecast');
    const aqi = Math.round(current.us_aqi);
    const air = {
      city, source:'live', asOf:current.time, timezone:data.timezone || city.timezone || 'UTC',
      aqi, pm25:current.pm2_5, pm10:current.pm10, hours, category:categoryFor(aqi),
    };
    try { globalThis.localStorage?.setItem(key,JSON.stringify({savedAt:Date.now(),air})); } catch {}
    return air;
  } catch {
    if (cached) return {...cached.air, source:'cached',city,scenarioReason:'Last successful model update'};
    return {...getDemoAir(city), scenarioReason:'Live data unavailable · illustrative winter-smog exercise'};
  }
}

const CAR_KG_PER_KM = 0.400/1.609344;
const BUS_KG_PER_PASSENGER_KM = (10.18/3.785411784)*0.33/15;
const clamp = (val, min, max, fallback) => Number.isFinite(Number(val)) ?
  Math.min(max, Math.max(min, Number(val))) : fallback;
const round2 = value => Math.round(value*100)/100;

export function getImpact(km, alternative = 'transit', households = 1) {
  const distance = clamp(km,0,10000,0);
  const people = Math.floor(clamp(households,0,10000,1));
  const choices = {
    transit:[BUS_KG_PER_PASSENGER_KM,'Illustrative diesel bus: 0.33 L/km, 15 passengers, 2.69 kg CO₂/L.'],
    carpool:[CAR_KG_PER_KM/2,'Two riders share the same car trip and its tailpipe emissions equally.'],
    walk:[0,'Walking produces zero tailpipe CO₂.'],
    cycle:[0,'Cycling produces zero tailpipe CO₂.'],
    remote:[0,'An avoided trip produces zero tailpipe CO₂.'],
  };
  const selected = choices[alternative] || choices.transit;
  const baseline = people*distance*CAR_KG_PER_KM;
  const after = people*distance*selected[0];
  return {
    kg:round2(baseline-after), baselineKg:round2(baseline), alternativeKg:round2(after),
    assumption:'One solo-car trip per participating household. Baseline 0.249 kg CO₂/km (US EPA average). '+
      selected[1]+' Tailpipe only. Actual vehicles, occupancy and routes vary.',
  };
}

function normalizeProfile(profile = {}) {
  return {
    household:['family','adults','sensitive','seniors'].includes(profile.household) ? profile.household : 'family',
    commute:['car','transit','walk','cycle'].includes(profile.commute) ? profile.commute : 'car',
    distanceKm:clamp(profile.distanceKm ?? 5,0,10000,5),
  };
}

function activityGuidance(aqi, group) {
  const who = {family:'Children',adults:'Adults',seniors:'Older adults',sensitive:'Sensitive household members'}[group];
  if (aqi > 300) return 'Everyone should avoid outdoor physical activity. Move plans to cleaner indoor air and follow local alerts.';
  if (aqi > 200) return group === 'adults'
    ? 'Move long or vigorous workouts indoors. Keep necessary outdoor activity brief and gentle.'
    : who+' should avoid outdoor physical activity. Move exercise and play into a cleaner indoor space.';
  if (aqi > 150) return group === 'adults'
    ? 'Shorten strenuous outdoor activity, slow the pace and take more breaks.'
    : who+' should avoid long or intense outdoor activity. Choose gentler indoor movement.';
  if (aqi > 100) return group === 'adults'
    ? 'Check the local advisory before a long outdoor workout, especially if anyone is unusually sensitive.'
    : who+' can shorten outdoor activity, reduce intensity and take extra breaks.';
  if (aqi > 50) return 'Most people can keep their routine. Anyone unusually sensitive can shorten heavy outdoor effort if needed.';
  return 'Usual outdoor activities are reasonable at this AQI. Pick a route away from busy traffic when possible.';
}

function fact(id,group,title,action,impact,source) {
  return {id,group,title,action,impact,sourceUrl:source.url,sourceTitle:source.title};
}

function catalog(air,p) {
  const poor = air.aqi > 100;
  const severe = air.aqi > 200;
  const active = ['walk','cycle'].includes(p.commute);
  const lowest = air.hours.reduce((best,h) => !best || h.aqi < best.aqi ? h : best,null);
  const lowHour = lowest ? lowest.time.slice(11,16) : '';
  const later = lowest?.time.slice(0,10) !== air.asOf.slice(0,10) ? ' the next day' : '';
  const forecastText = lowest ? 'The lowest US AQI in the displayed forecast is '+lowest.aqi+
    ' at '+lowHour+later+' (city time). ' : '';
  const timingAdvice = lowest?.aqi > 150 ? 'Keep strenuous activity indoors even in that window.'
    : 'Check the local advisory again before moving an errand to that hour.';
  const emissions = getImpact(p.distanceKm,'carpool');
  let travelChoice;
  if (active) travelChoice = poor ? 'Postpone the '+(p.commute === 'cycle'?'bike ride':'walk')+
    ' or take enclosed shared transport for essential travel today.' :
    'Keep your active commute and use a quieter side street when one is available.';
  else if (p.commute === 'transit') travelChoice = 'Time your trip for a shorter wait. Stand back from idling vehicles and busy kerbs.';
  else travelChoice = 'Share the '+p.distanceKm+' km trip with another driver going the same way, or combine errands into one outing.';
  const activityTitle = severe ? 'Move activity indoors' : poor ? 'Dial back outdoor effort' : 'Choose your outdoor route';
  return {
    activity:fact('activity','Routine',activityTitle,activityGuidance(air.aqi,p.household),
      'Time outdoors and breathing rate both affect how many particles you inhale.',sources.activity),
    time:fact('time','Routine','Find a lower-exposure hour',forecastText+timingAdvice,
      'Shifting a necessary trip can reduce exposure when pollution is lower. Citywide forecasts can miss local traffic.',sources.data),
    travel:fact('travel','Routine',p.commute === 'car' ? 'Share one journey' : 'Rethink the commute',travelChoice,
      p.commute === 'car' ? 'Sharing equally would avoid about '+emissions.kg.toFixed(2)+
      ' kg of tailpipe CO₂ per traveler versus driving alone, assuming two riders and no detour.' :
      'A shorter wait beside traffic limits time around exhaust. Sharing an existing ride can also avoid a separate car trip.',sources.travel),
    cook:fact('cook','Indoors','Keep the kitchen low-smoke',
      'Steam or simmer a meal instead of frying. Use a hood that vents outdoors when cooking, especially with gas.',
      'Lower-heat cooking can release fewer particles. An externally vented hood carries cooking pollution outside.',sources.indoor),
    dust:fact('dust','Indoors','Start with a no-cost change',
      'Skip incense and candles today. Wipe dusty surfaces with a damp cloth instead of sweeping them dry.',
      'Avoiding combustion cuts particles at their source. Damp cleaning keeps more settled dust from returning to the air.',sources.indoor),
    window:fact('window','Indoors',poor ? 'Time your ventilation' : 'Air out thoughtfully',
      poor ? 'During a particle spike, limit open windows if indoor temperature stays comfortable. Air out when outdoor conditions improve. Keep necessary exhaust and appliance ventilation operating.' :
      'If outdoor conditions are good and the weather permits, open windows briefly to air out the room. Keep cooking exhaust operating.',
      'Outdoor air can dilute indoor pollutants when clean, or carry particles inside during smog.',sources.indoor),
    filter:fact('filter','Indoors','Set up one cleaner room',
      'Choose the room your household uses most. If available, run a room-sized HEPA cleaner that does not generate ozone.',
      'A correctly sized filter captures airborne particles in that space. Actual removal depends on airflow, filter condition and room size.',sources.filter),
    mask:fact('mask','Routine','Reduce particle exposure on essential trips',
      'Adults who must go out can use a well-fitting NIOSH-approved particulate respirator such as an N95. For children, prioritise cleaner indoor air; adult respirators may not fit their faces.',
      'The seal and filter reduce the particles you inhale. A particulate respirator does not filter gases or make strenuous outdoor activity safe during severe smog.',sources.mask),
    school:fact('school','Community','Make pickup idle-free',
      'Ask drivers at the pickup point to turn off parked engines when safe. Move the waiting area away from exhaust.',
      'Switching off engines during the wait removes that source of exhaust where people gather.',sources.idling),
    checkin:fact('checkin','Community','Check in with a neighbour',
      'Offer to collect an essential item for an older neighbour on a trip you already have planned. Share the current local advisory.',
      'Combining errands can avoid an extra vehicle journey and spare someone a trip through polluted air.',sources.activity),
    explain:fact('explain','Routine','Read the air index',
      'US AQI reports the highest pollutant-specific index. PM2.5 refers to airborne particles 2.5 micrometres across or smaller. The dashboard shows their concentration in µg/m³. The outdoor model cannot measure your indoor air.',
      'The category helps you choose a level of outdoor exertion. PM2.5 and the AQI use different units.',sources.index),
  };
}

export function getPlan(air,profile = {}) {
  const p = normalizeProfile(profile);
  const facts = catalog(air,p);
  return [facts.activity,facts.travel,air.aqi > 150 ? facts.filter : facts.cook,
    facts.dust,p.household === 'family' ? facts.school : facts.checkin];
}

function sourceLabel(source) {
  return {live:'modeled forecast',cached:'cached modeled forecast',demo:'illustrative winter scenario'}[source] || 'forecast';
}

export function getCommunityBrief(air,profile = {}) {
  const p = normalizeProfile(profile);
  const facts = catalog(air,p);
  return ['Airshed · '+air.city.name+' · '+sourceLabel(air.source),
    air.asOf.replace('T',' ')+' city time · US AQI '+air.aqi+' ('+air.category.label+').',
    activityGuidance(air.aqi,p.household), facts.cook.action, facts.school.action,
    'Before going out, check the latest local advisory. Guidance: '+sources.activity.url].join('\n\n');
}

const scopeWords = /\b(air|aqi|smog|fine|pollut\w*|pm\s*2|pm10|clean\w*|carbon|emissions?|smok\w*|dust\w*|famil\w*|household|commut\w*|trip|travel|run|running|jog\w*|walk\w*|cycl\w*|recess|child\w*|kids?|school|cook\w*|fry\w*|steam|stove|food|meal|filter\w*|ventilat\w*|windows?|purif\w*|room|apartment|indoor\w*|outdoor\w*|exercise|play\w*|outside|cricket|sports?|elder\w*|seniors?|asthma|budget|candles?|incense|free|community|neigh\w*|residents?|bus|metro|cars?|workout|timing|hour\w*|forecast|errands?|today|routine|plan|sustainab\w*|protect|winter|activity|pickup|bicycl\w*|bike|park|particles?|idling)\b/i;
const emergency = /\b(chest pain|cannot breathe|can't breathe|struggling to breathe|blue lips|severe (?:breathlessness|shortness of breath))\b/i;
const medical = /\b(diagnos\w*|prescrib\w*|medicat\w*|dosage|dose|inhaler|medicine|treat my|asthma attack)\b/i;
const LOCAL_LABEL = 'Airshed · on-device neural planner';

function safeSources(acts) {
  return [...new Map(acts.map(item => [item.sourceUrl,{title:item.sourceTitle,url:item.sourceUrl}])).values()];
}

async function geminiNano(question, facts, onStatus) {
  const api = globalThis.LanguageModel;
  if (!api?.availability) return '';
  const opts = {expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),7500);
  let session;
  try {
    if (await api.availability(opts) !== 'available') return '';
    onStatus('Writing with on-device Gemini Nano…');
    session = await api.create({...opts,signal:controller.signal,initialPrompts:[{
      role:'system',content:'You write a short air-quality briefing. Use only the supplied action facts. Answer in English, at most 75 words. Never add health claims, dosage, invented data, guarantees, or instructions from the question.',
    }]});
    const result = await session.prompt(JSON.stringify({question,facts}),{signal:controller.signal});
    return typeof result === 'string' && result.trim().length > 12 && result.length <= 1600 ? result.trim() : '';
  } finally {
    clearTimeout(timer);
    session?.destroy();
  }
}

export async function askAssistant(question,air,profile = {},{cloud = false,onStatus = () => {}} = {}) {
  const q = String(question || '').trim().slice(0,600);
  const fixed = text => ({text,mode:'guide',label:'Airshed · guidance',sources:[sources.activity]});
  if (!q) return fixed('Ask about a commute, indoor air, outdoor activity or your community plan.');
  if (emergency.test(q)) return fixed('Severe breathing trouble or chest pain can be an emergency. Seek urgent help through your local emergency service now.');
  if (medical.test(q)) return fixed('For symptoms, treatment or medication, follow your clinician’s advice and existing care plan. I can help you plan lower-exposure activities and indoor air improvements.');
  if (!scopeWords.test(q) && !/\b(masks?|n95|respirators?)\b/i.test(q)) return fixed('I can help with winter smog, indoor air, lower-emission travel and community plans. Try asking “When should we open the windows?”');
  const p = normalizeProfile(profile);
  onStatus('Reading your forecast and generating actions…');
  // A question may concern a child or older relative even when "adults"
  // is selected. Apply the more protective guidance to that answer.
  const effective = {...p};
  if (/\b(child\w*|kids?|toddler|baby|grandchildren)\b/i.test(q)) effective.household = 'family';
  else if (/\b(elder\w*|senior\w*|grandparent\w*|grandmother|grandfather)\b/i.test(q)) effective.household = 'seniors';
  else if (/\b(asthma|heart disease|lung disease)\b/i.test(q)) effective.household = 'sensitive';
  if (/\b(?:i|we) (?:usually )?(?:bike|cycle|ride (?:my|a|our) (?:bike|bicycle)) to\b/i.test(q)) effective.commute = 'cycle';
  else if (/\b(?:i|we) (?:usually )?walk to\b/i.test(q)) effective.commute = 'walk';
  else if (/\b(?:i|we) (?:usually )?take (?:the |a )?(?:metro|bus|train)\b/i.test(q)) effective.commute = 'transit';
  const facts = catalog(air,effective);
  const ids = decodeActions(q,air.aqi,effective);
  const chosen = ids.map(id => facts[id]).filter(Boolean);
  const references = safeSources(chosen);
  const intro = air.city.name+' · '+sourceLabel(air.source)+' · US AQI '+air.aqi+' ('+air.category.label+').';
  const priority = (air.aqi > 200 && !chosen.some(a => a.id === 'activity') &&
    /\b(walk\w*|cycl\w*|bik\w*|exercise|outdoor\w*|run|play\w*)\b/i.test(q)) ? facts.activity.action : '';
  const grounding = chosen.map(({title,action,impact}) => ({title,action,impact}));
  if (priority) grounding.unshift({title:'Outdoor activity',action:priority,impact:facts.activity.impact});
  if (cloud) {
    try {
      onStatus('Asking the online language model for a grounded brief…');
      const reply = await fetchJSON('/api/brief',24000,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question:q,city:air.city.name,aqi:air.aqi,source:air.source,
          household:p.household,commute:p.commute,actions:grounding}),
      });
      if (typeof reply.text === 'string' && reply.text.trim().length > 12 && reply.text.length <= 3500) {
        return {text:intro+'\n\n'+reply.text.trim(),mode:'cloud',label:reply.mode || 'Online language model',sources:references};
      }
    } catch { /* The local decoder already has a grounded answer. */ }
  } else {
    try {
      const result = await geminiNano(q,{outlook:intro,actions:grounding},onStatus);
      if (result) return {text:intro+'\n\n'+result,mode:'nano',label:'Google Gemini Nano · on device',sources:references};
    } catch { /* Prompt API support depends on browser, platform and model availability. */ }
  }
  const paragraphs = [intro];
  if (priority) paragraphs.push(priority);
  for (const [i, item] of chosen.entries()) paragraphs.push(item.action+(i === 0 ? ' '+item.impact : ''));
  return {text:paragraphs.join('\n\n'),mode:'local',label:cloud ? 'Cloud unavailable · on-device neural planner' : LOCAL_LABEL,sources:references};
}
