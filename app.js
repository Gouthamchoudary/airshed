import { cities, searchCities, getAir, getDemoAir, getPlan, getImpact, getCommunityBrief, askAssistant } from './engine.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const iconPaths = {
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sliders: '<path d="M3 7h7m4 0h7M3 17h11m4 0h3"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  spark: '<path d="M11 3.5c.8 5.1 2.5 7.1 7.2 8.5-4.7 1.1-6.5 3.5-7.2 8.5-.9-5-2.8-7.4-7.2-8.5C8.2 10.6 10 8.6 11 3.5Z"/><path d="M19 2v5m-2.5-2.5h5"/>',
  waves: '<path d="M2 7c3 2 5 2 9-.4s6-2.5 11-.4M2 12c3 2 5 2 9-.4s6-2.5 11-.4M2 17c3 2 5 2 9-.4s6-2.5 11-.4"/>',
  chart: '<path d="M3 4v16h18M7 15v-3m4 3V8m4 7v-5m4 5V5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
  edit: '<path d="m4 16-1 5 5-1L20 8l-4-4zm10-10 4 4"/>',
  route: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h9a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h9"/>',
  house: '<path d="m2 11 10-8 10 8m-18-1v11h16V10m-11 11v-7h6v7"/>',
  leaf: '<path d="M20 3c1 8-1 15-9 15-5 0-7-4-6-7 1-5 8-5 15-8Zm-16 18 11-11"/>',
  megaphone: '<path d="m3 10 17-6v14L3 14zm1 4 2 6h3l-2-5m14-7 2-1m-2 6 2 1"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  send: '<path d="m3 4 18 8-18 8 3-8zm3 8h15"/>',
  shield: '<path d="m12 2 8 4v5c0 5-3 8-8 11-5-3-8-6-8-11V6z"/><path d="m8 12 3 3 5-6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};
function icon(name) {
  return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+(iconPaths[name] || '')+'</svg>';
}
document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem('airshed-v1:'+key)) ?? fallback; } catch { return fallback; }
}
function setLocal(key, value) {
  try { localStorage.setItem('airshed-v1:'+key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private browsing. */ }
}
const households = {family:'Family with children', adults:'Adult household', sensitive:'Pollution-sensitive household', seniors:'Older adults'};
const commutes = {car:'Private car', transit:'Public transit', walk:'Walk', cycle:'Cycle'};
const baselineProfile = {household:'family', commute:'car', distanceKm:8};
const profile = {...baselineProfile, ...readLocal('profile', {})};
if (!(profile.household in households)) profile.household = baselineProfile.household;
if (!(profile.commute in commutes)) profile.commute = baselineProfile.commute;
profile.distanceKm = Math.min(60, Math.max(1, Number(profile.distanceKm) || 8));
const params = new URLSearchParams(location.search);
const defaultCity = cities.find(c => /^(new )?delhi$/i.test(c.name)) || cities[0];
const storedCity = readLocal('city', defaultCity);
let city = storedCity && Number.isFinite(storedCity.lat) && Number.isFinite(storedCity.lon) && storedCity.name ? storedCity : defaultCity;
let requestedMode = params.get('demo') === '1' ? 'demo' : 'live';
let air = getDemoAir(city), actionFilter = 'All', metric = 'aqi', pickedHour = null;
let requestId = 0, activeAnswer = 0, searching = 0, currentPlan = [], brief = '', toastTimer;
const modal = $('modal');
modal.setAttribute('aria-labelledby','modal-title');
const fmt = (n, digits=0) => Number.isFinite(n) ? Number(n).toLocaleString('en',{maximumFractionDigits:digits}) : '–';
function localParts(value, opts) {
  if (value == null) return '';
  const str = String(value);
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(str);
  const date = new Date(zoned || typeof value === 'number' ? value : str+'Z');
  if (Number.isNaN(date.getTime())) return '';
  try { return new Intl.DateTimeFormat('en-GB',{timeZone:zoned || typeof value === 'number' ? air.timezone || 'UTC' : 'UTC',...opts}).format(date); } catch { return ''; }
}
function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'),2800);
}
function safeLink(url) {
  try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) ? escapeHtml(u.href) : ''; } catch { return ''; }
}
function statusColor(aqi) {
  return aqi > 300 ? '#823c58' : aqi > 200 ? '#97679a' : aqi > 150 ? '#c96e5e' : aqi > 100 ? '#ce8e4b' : aqi > 50 ? '#b2a04c' : '#739c73';
}
function paintConditions(loading=false) {
  const demo = air.source === 'demo';
  const cityName = air.city?.name || city.name;
  const asOf = localParts(air.asOf,{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'});
  $('current-city').textContent = cityName;
  $('city-button').setAttribute('aria-label','Change location, currently '+cityName);
  $('date').textContent = localParts(air.asOf,{weekday:'long',day:'numeric',month:'long',year:'numeric'}) || 'Local air intelligence';
  $('aqi').textContent = fmt(air.aqi);
  $('pm25').textContent = fmt(air.pm25,1);
  $('pm10').textContent = fmt(air.pm10,1);
  $('category').innerHTML = '<span class="severity-dot"></span>'+escapeHtml(air.category?.label || 'Unknown');
  $('category').style.setProperty('--severity',statusColor(air.aqi));
  $('air-source').textContent = demo ? 'Winter scenario' : air.source === 'cached' ? 'Saved forecast' : 'Model forecast';
  $('air-source').dataset.mode = air.source;
  $('source-caption').textContent = loading ? 'Checking the live forecast · showing a simulated winter scenario.' : demo ? (requestedMode==='live' ? 'Live forecast unavailable · showing a simulated winter scenario.' : 'Winter smog simulation · illustrative hourly values.') : (air.source==='cached' ? 'Cached Open-Meteo / CAMS forecast' : 'Open-Meteo / CAMS model forecast')+(asOf ? ' · '+asOf+' local' : '');
  $('switch-mode').textContent = requestedMode === 'demo' ? 'View live forecast' : demo && !loading ? 'Retry live forecast' : 'Try winter scenario';
  $('forecast-zone').textContent = 'City local time';
  renderChart();
}
function hourLabel(hour) {
  return localParts(hour.time,{hour:'2-digit',minute:'2-digit'}) || (String(hour.time).match(/\d\d:\d\d/) || ['–'])[0];
}
function renderChart() {
  document.querySelectorAll('[data-metric]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.metric===metric)));
  const hours = (air.hours || []).filter(h => Number.isFinite(h[metric])).slice(0,24);
  if (!hours.length) {
    $('chart').innerHTML = '<p class="empty">Hourly values are unavailable for this forecast.</p>';
    $('forecast-label').textContent = 'Hourly outlook';
    $('forecast-detail').textContent = 'Check back when the model updates.';
    return;
  }
  const values = hours.map(h => h[metric]);
  const max = Math.max(...values,1);
  const step = max>100 ? 50 : max>20 ? 10 : 5;
  const scale = Math.max(step,Math.ceil(max/step)*step);
  const lowest = values.indexOf(Math.min(...values));
  const selected = pickedHour !== null && pickedHour < hours.length ? pickedHour : null;
  const bars = hours.map((h,i) => {
    const name = hourLabel(h)+' · '+fmt(h[metric],metric==='aqi'?0:1)+(metric==='aqi'?' US AQI':' µg/m³ PM2.5');
    return '<button class="bar" data-hour="'+i+'" title="'+escapeHtml(name)+'" aria-label="'+escapeHtml(name)+'" aria-pressed="'+(selected===i)+'" style="--h:'+Math.max(1,h[metric]/scale*100)+'%;--bar:'+statusColor(h.aqi)+'"></button>';
  }).join('');
  const labels = Array.from(new Set([0,Math.round((hours.length-1)/3),Math.round((hours.length-1)*2/3),hours.length-1]));
  $('chart').innerHTML = '<div class="plot-row"><div aria-hidden="true" class="y-axis"><span style="bottom:100%">'+scale+'</span><span style="bottom:50%">'+fmt(scale/2,1)+'</span><span style="bottom:0%">0</span></div><div class="plot">'+bars+'</div></div><div class="x-axis" aria-hidden="true">'+labels.map(i=>'<span>'+escapeHtml(hourLabel(hours[i]))+'</span>').join('')+'</div>';
  const detail = hours[selected === null ? lowest : selected];
  $('forecast-label').textContent = selected === null ? 'Lowest forecast '+(metric==='aqi'?'AQI':'PM2.5') : 'Selected forecast hour';
  const date = localParts(detail.time,{weekday:'short'});
  $('forecast-detail').textContent = (date?date+' ':'')+hourLabel(detail)+' · '+fmt(detail[metric],metric==='aqi'?0:1)+(metric==='aqi'?' US AQI':' µg/m³');
}
function progressKey() {
  return 'actions:'+city.lat+':'+city.lon+':'+String(air.asOf).slice(0,10)+':'+air.source+':'+profile.household+':'+profile.commute;
}
const groupDesign = {
  Routine:{icon:'route',fill:'#e6ecdc',ink:'#577141'},
  Indoors:{icon:'house',fill:'#f6e7d5',ink:'#93623b'},
  Community:{icon:'users',fill:'#e6ebf4',ink:'#536e92'}
};
function renderPlan() {
  currentPlan = getPlan(air,profile);
  const saved = new Set(readLocal(progressKey(),[]));
  $('profile-summary').textContent = households[profile.household];
  $('plan-progress').textContent = currentPlan.filter(p=>saved.has(p.id)).length+' of '+currentPlan.length+' done';
  document.querySelectorAll('[data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.filter===actionFilter)));
  const display = actionFilter==='All' ? currentPlan : currentPlan.filter(p=>p.group===actionFilter);
  $('plan-list').innerHTML = display.map(action => {
    const done = saved.has(action.id), g = groupDesign[action.group] || groupDesign.Routine;
    const url = safeLink(action.sourceUrl);
    return '<article class="plan-card" data-done="'+done+'" style="--group-fill:'+g.fill+';--group-ink:'+g.ink+'"><div class="action-top"><span class="group-icon">'+icon(g.icon)+'</span><span class="action-kind">'+escapeHtml(action.group)+'</span><button class="check-action" data-id="'+escapeHtml(action.id)+'" aria-pressed="'+done+'" aria-label="'+(done?'Mark unfinished: ':'Mark done: ')+escapeHtml(action.title)+'" title="'+(done?'Mark unfinished':'Mark done')+'">'+icon(done?'check':'plus')+'</button></div><h3>'+escapeHtml(action.title)+'</h3><p class="action-text">'+escapeHtml(action.action)+'</p><details><summary>Why this helps</summary><p>'+escapeHtml(action.impact)+'</p>'+(url?'<a href="'+url+'" target="_blank" rel="noopener noreferrer">Read the source</a>':'')+'</details></article>';
  }).join('') || '<p class="empty">No actions in this category for this brief.</p>';
}
function renderImpact() {
  const distance = Number($('distance').value), selection = $('alternative').value;
  const count = Number($('households').value), valid = count>=1 && count<=1000 && Number.isInteger(count);
  $('distance-value').textContent = distance+' km';
  if (valid) {
    const impact = getImpact(distance,selection,count);
    $('impact-result').textContent = fmt(impact.kg,2)+' kg';
    $('impact-method').textContent = 'Solo car: '+fmt(impact.baselineKg,2)+' kg. Alternative: '+fmt(impact.alternativeKg,2)+' kg. '+impact.assumption;
  } else {
    $('impact-result').textContent = '–';
    $('impact-method').textContent = 'Enter 1 to 1,000 households to calculate this trip.';
  }
  const warn = air.aqi>100 && ['cycle','walk'].includes(selection);
  $('travel-cue').hidden = !warn;
  $('travel-cue').textContent = warn ? 'Outdoor exertion can increase exposure. On high-smog days, postpone the trip or use enclosed transport.' : '';
}
function renderBrief() {
  brief = getCommunityBrief(air,profile);
  $('brief-preview').textContent = brief;
}
function resetChat() {
  activeAnswer++;
  $('thread').replaceChildren(); $('ask-status').textContent='';
  $('ask-submit').disabled = false;
}
function renderAll(loading=false) {
  paintConditions(loading); renderPlan(); renderImpact(); renderBrief();
}
async function loadConditions(mode) {
  requestedMode = mode;
  const id = ++requestId;
  resetChat(); pickedHour=null;
  if (mode==='demo') { air=getDemoAir(city); renderAll(); return; }
  air=getDemoAir(city); renderAll(true);
  try { const fresh = await getAir(city); if (id!==requestId) return; air=fresh; }
  catch { if (id!==requestId) return; air=getDemoAir(city); }
  renderAll();
}
function openDialog(title,html) {
  searching++;
  $('modal-title').textContent=title; $('modal-content').innerHTML=html;
  if (!modal.open) modal.showModal();
}
function closeDialog() { searching++; modal.close(); }
function openCities() {
  openDialog('Choose your city','<label for="city-search" class="dialog-help">Search by city or choose a location below.</label><input class="dialog-search" type="search" id="city-search" placeholder="Search cities worldwide…" autocomplete="off"><div class="city-list" id="city-list" aria-live="polite"></div>');
  let options = cities;
  function render(results) {
    options=results;
    $('city-list').innerHTML=results.map((c,i)=>'<button class="city-option" data-index="'+i+'">'+icon('pin')+'<span>'+escapeHtml(c.name)+'</span><small>'+escapeHtml([c.region || c.admin1,c.country].filter(Boolean).join(', '))+'</small></button>').join('') || '<p class="empty">No matching cities. Try a nearby town or a different spelling.</p>';
  }
  render(cities);
  $('city-search').focus();
  let debounce;
  $('city-search').addEventListener('input', () => {
    const query=$('city-search').value.trim(), seq=++searching;
    clearTimeout(debounce);
    if (query.length<2) { render(cities.filter(c=>c.name.toLowerCase().includes(query.toLowerCase()))); return; }
    $('city-list').innerHTML='<p class="empty">Searching cities…</p>';
    debounce=setTimeout(async()=>{
      let results;
      try { results=await searchCities(query); } catch { results=cities.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())); }
      if (seq===searching && modal.open && $('city-list')) render(results);
    },200);
  });
  $('city-list').addEventListener('click',e=>{
    const btn=e.target.closest('[data-index]');
    if (!btn) return;
    city=options[Number(btn.dataset.index)];
    setLocal('city',city); closeDialog(); loadConditions(requestedMode);
  });
}
function optionsOf(map,selected) {
  return Object.entries(map).map(([k,v])=>'<option value="'+k+'" '+(k===selected?'selected':'')+'>'+escapeHtml(v)+'</option>').join('');
}
function editProfile() {
  openDialog('Your household','<p class="dialog-help">These choices shape your daily actions, assistant answers and commute comparison. Your profile is saved on this device.</p><form id="profile-form"><label class="form-label">Household<select id="profile-household" class="field">'+optionsOf(households,profile.household)+'</select></label><label class="form-label">Usual commute<select id="profile-commute" class="field">'+optionsOf(commutes,profile.commute)+'</select></label><label class="form-label">One-way distance (km)<input class="field" id="profile-distance" type="number" min="1" max="60" step="1" required value="'+profile.distanceKm+'"></label><div class="modal-actions"><button class="button solid" type="submit">Save household</button></div></form>');
  $('profile-form').addEventListener('submit',e=>{
    e.preventDefault();
    Object.assign(profile,{household:$('profile-household').value,commute:$('profile-commute').value,distanceKm:Number($('profile-distance').value)});
    setLocal('profile',profile); $('distance').value=profile.distanceKm;
    closeDialog(); resetChat(); renderPlan(); renderImpact(); renderBrief(); showToast('Household plan updated');
  });
}
function chooseMode() {
  openDialog('Air data mode','<div class="mode-options"><button class="mode-option" data-mode="live" aria-pressed="'+(air.source!=='demo')+'"><strong>Live forecast</strong><small>Request the current CAMS model estimate and upcoming hourly values for your city.</small></button><button class="mode-option" data-mode="demo" aria-pressed="'+(air.source==='demo')+'"><strong>Winter scenario</strong><small>Explore a simulated smog episode with a fixed forecast, household guidance and community brief.</small></button></div>');
  $('modal-content').querySelectorAll('[data-mode]').forEach(btn=>btn.onclick=()=>{closeDialog();loadConditions(btn.dataset.mode);});
}
function sourceDialog() {
  openDialog('Data & methodology','<div class="source-list"><div><h3>Outdoor air</h3><p>Open-Meteo supplies hourly CAMS estimates for the selected coordinates. Airshed uses the US AQI scale throughout. A city-wide model estimate can differ from your street or a nearby monitor. Consult local advisories when conditions change.</p><a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener">Open-Meteo and CAMS methodology</a></div><div><h3>Winter scenario</h3><p>The scenario uses illustrative values to explore a winter episode. If a live request fails, the dashboard labels the available data as cached or simulated.</p></div><div><h3>Household actions</h3><p>Recommendations use your household, commute and current brief. Expand “Why this helps” on an action for its reasoning and source. The brief provides general planning guidance. Follow local public-health advice and your clinician’s care plan.</p><a href="https://www.airnow.gov/aqi/aqi-basics/" target="_blank" rel="noopener">AirNow’s guide to US AQI</a></div><div><h3>Transport emissions</h3><p>The impact lab compares estimated tailpipe CO₂ from one trip. Its assumptions appear below the calculator. Exposure also depends on route, duration and activity.</p></div></div>');
}
function addEntry(role,label,body,sources=[]) {
  const item=document.createElement('div'); item.className='chat-entry '+role;
  const heading=document.createElement('strong'); heading.textContent=label;
  const p=document.createElement('p'); p.textContent=body;
  item.append(heading,p);
  const refs=document.createElement('div'); refs.className='chat-sources';
  for (const src of sources) {
    if (!safeLink(src.url)) continue;
    const a=document.createElement('a'); a.href=src.url; a.textContent=src.title || 'Source'; a.target='_blank'; a.rel='noopener noreferrer'; refs.append(a);
  }
  if (refs.childElementCount) item.append(refs);
  $('thread').append(item); $('thread').scrollTop=$('thread').scrollHeight;
}
async function submitQuestion() {
  const question=$('question').value.trim();
  if (!question || $('ask-submit').disabled) return;
  const seq=++activeAnswer;
  addEntry('user','You',question);
  $('question').value=''; $('ask-submit').disabled=true;
  $('ask-status').textContent='Preparing your answer…';
  try {
    const answer=await askAssistant(question,air,profile,{cloud:$('cloud-ai').checked,onStatus:s=>{if(seq===activeAnswer)$('ask-status').textContent=s;}});
    if (seq!==activeAnswer) return;
    addEntry('assistant',answer.label || 'Airshed',answer.text,answer.sources || []);
    $('ask-status').textContent='Answer ready';
  } catch {
    if (seq!==activeAnswer) return;
    $('question').value=question;
    addEntry('assistant','Airshed','The assistant could not complete this response. Try again, or use the action plan for your current brief.');
    $('ask-status').textContent='Answer interrupted';
  } finally { if(seq===activeAnswer) $('ask-submit').disabled=false; }
}
async function copyBrief() {
  try {
    await navigator.clipboard.writeText(brief);
    $('copy-brief').querySelector('span').textContent='Copied!';
    $('share-status').textContent='Brief copied to clipboard.'; showToast('Community brief copied');
    setTimeout(()=>$('copy-brief').querySelector('span').textContent='Copy brief',1800);
  } catch {
    openDialog('Copy your brief','<p class="dialog-help">Select and copy the bulletin below.</p><textarea class="field" rows="9" id="copy-text" readonly></textarea>');
    $('copy-text').value=brief; $('copy-text').focus(); $('copy-text').select();
  }
}
$('city-button').onclick=openCities;
$('profile-button').onclick=$('edit-profile').onclick=editProfile;
$('source-button').onclick=$('footer-source').onclick=sourceDialog;
$('air-source').onclick=chooseMode;
$('switch-mode').onclick=()=>loadConditions(requestedMode==='demo' || (air.source==='demo' && $('switch-mode').textContent.startsWith('Retry')) ? 'live':'demo');
$('close-modal').onclick=closeDialog;
modal.addEventListener('click',e=>{if (e.target===modal) { const b=modal.getBoundingClientRect(); if (e.clientX<b.left || e.clientX>b.right || e.clientY<b.top || e.clientY>b.bottom) closeDialog(); }});
modal.addEventListener('cancel',()=>{searching++;});
document.querySelectorAll('[data-metric]').forEach(btn=>btn.onclick=()=>{metric=btn.dataset.metric;pickedHour=null;renderChart();});
$('chart').addEventListener('click',e=>{
  const bar=e.target.closest('[data-hour]'); if (!bar) return;
  pickedHour=Number(bar.dataset.hour); renderChart(); $('chart').querySelector('[data-hour="'+pickedHour+'"]').focus({preventScroll:true});
});
document.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{actionFilter=btn.dataset.filter;renderPlan();});
$('plan-list').addEventListener('click',e=>{
  const btn=e.target.closest('.check-action'); if(!btn) return;
  const saved=new Set(readLocal(progressKey(),[])), id=btn.dataset.id;
  if(saved.has(id))saved.delete(id); else saved.add(id);
  setLocal(progressKey(),[...saved]); renderPlan(); Array.from($('plan-list').querySelectorAll('.check-action')).find(b=>b.dataset.id===id)?.focus({preventScroll:true});
});
$('ask-form').addEventListener('submit',e=>{e.preventDefault();submitQuestion();});
$('question').addEventListener('keydown',e=>{if(e.key==='Enter' && !e.shiftKey && !e.isComposing){e.preventDefault();submitQuestion();}});
document.querySelectorAll('.suggestions button').forEach(btn=>btn.onclick=()=>{if(!$('ask-submit').disabled){$('question').value=btn.textContent;submitQuestion();}});
['distance','alternative','households'].forEach(id=>$(id).addEventListener('input',renderImpact));
$('copy-brief').onclick=copyBrief;
$('download-brief').onclick=()=>{
  const url=URL.createObjectURL(new Blob([brief],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download='airshed-'+String(city.name).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-brief.txt'; document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000); showToast('Community brief saved as text');
};
const navLinks=Array.from(document.querySelectorAll('.nav-link'));
function highlightNav() {
  let active='overview';
  for (const id of ['overview','plan','ask','impact','community']) {
    const el=$(id);
    if (el.getBoundingClientRect().top <= window.innerHeight*.3 && !(id==='community' && window.innerWidth>740 && location.hash!=='#community')) active=id;
  }
  navLinks.forEach(link=>{const on=link.hash==='#'+active; link.classList.toggle('active',on); if(on)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
}
window.addEventListener('scroll',highlightNav,{passive:true}); window.addEventListener('hashchange',highlightNav);
$('distance').value=profile.distanceKm;
loadConditions(requestedMode);

