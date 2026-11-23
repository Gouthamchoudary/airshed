import { searchCities, cities } from '../domain/geography.js';
import { commuteLabels, householdLabels, normalizeProfile } from '../domain/profile.js';
import { byId, element } from './dom.js';
import { icon } from './icons.js';

const cityMarkup = `
  <label for="city-search" class="dialog-help">Search by city or choose a location below.</label>
  <input class="dialog-search" type="search" id="city-search" placeholder="Search cities worldwide…" autocomplete="off">
  <p id="city-status" class="sr-only" role="status"></p>
  <div class="city-list" id="city-list"></div>
`;

const profileMarkup = `
  <p class="dialog-help">These choices shape your daily actions, assistant answers and commute comparison. Your profile is saved on this device.</p>
  <form id="profile-form">
    <label class="form-label">Household<select id="profile-household" class="field"></select></label>
    <label class="form-label">Usual commute<select id="profile-commute" class="field"></select></label>
    <label class="form-label">One-way distance (km)
      <input class="field" id="profile-distance" type="number" min="1" max="60" step="1" required>
    </label>
    <div class="modal-actions"><button class="button solid" type="submit">Save household</button></div>
  </form>
`;

const modeMarkup = `
  <div class="mode-options">
    <button class="mode-option" type="button" data-mode="live">
      <strong>Live forecast</strong><small>Request the current CAMS model estimate and upcoming hourly values for your city.</small>
    </button>
    <button class="mode-option" type="button" data-mode="demo">
      <strong>Winter scenario</strong><small>Explore a simulated smog episode with a fixed forecast, household guidance and community brief.</small>
    </button>
  </div>
`;

const methodologyMarkup = `
<div class="source-list"><div><h3>Outdoor air</h3><p>Open-Meteo supplies hourly CAMS estimates for the selected coordinates. Airshed uses the US AQI scale throughout. A city-wide model estimate can differ from your street or a nearby monitor. Consult local advisories when conditions change.</p><a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener">Open-Meteo and CAMS methodology</a></div>
  <div><h3>Winter scenario</h3><p>The scenario uses illustrative values to explore a winter episode. If a live request fails, the dashboard labels the available data as cached or simulated.</p></div>
  <div><h3>Household actions</h3><p>Recommendations use your household, commute and current brief. Expand “Why this helps” on an action for its reasoning and source. The brief provides general planning guidance. Follow local public-health advice and your clinician’s care plan.</p><a href="https://www.airnow.gov/aqi/aqi-basics/" target="_blank" rel="noopener">AirNow’s guide to US AQI</a></div>
  <div><h3>Transport emissions</h3><p>The impact lab compares estimated tailpipe CO₂ from one trip. Its assumptions appear below the calculator. Exposure also depends on route, duration and activity.</p></div></div>
`;

function setOptions(select, labels, selected) {
  select.replaceChildren(...Object.entries(labels).map(([key, label]) => new Option(label, key)));
  select.value = selected;
}

export function createDialogs() {
  const dialog = byId('modal');
  const content = byId('modal-content');
  let session = new AbortController();

  function open(title, staticMarkup) {
    session.abort();
    session = new AbortController();
    byId('modal-title').textContent = title;
    // Only module-local templates are parsed. Runtime values use textContent or .value.
    content.innerHTML = staticMarkup;
    if (!dialog.open) dialog.showModal();
    return session.signal;
  }

  function close() {
    session.abort();
    dialog.close();
  }

  byId('close-modal').addEventListener('click', close);
  dialog.addEventListener('cancel', () => session.abort());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (
      event.clientX < left ||
      event.clientX > right ||
      event.clientY < top ||
      event.clientY > bottom
    )
      close();
  });

  function chooseCity(onSelect) {
    const signal = open('Choose your city', cityMarkup);
    const input = byId('city-search');
    const list = byId('city-list');
    const status = byId('city-status');
    let timer;
    let request;

    function draw(results, announce = true) {
      const choices = results.map((city) => {
        const button = element('button', { class: 'city-option', type: 'button' });
        const region = [city.region || city.admin1, city.country].filter(Boolean).join(', ');
        button.append(
          icon('pin'),
          element('span', { text: city.name }),
          element('small', { text: region }),
        );
        button.addEventListener('click', () => {
          close();
          onSelect(city);
        });
        return button;
      });
      if (choices.length) list.replaceChildren(...choices);
      else
        list.replaceChildren(
          element('p', {
            class: 'empty',
            text: 'No matching cities. Try a nearby town or a different spelling.',
          }),
        );
      if (announce)
        status.textContent = choices.length
          ? `${choices.length} cities found`
          : 'No matching cities';
    }

    draw(cities, false);
    input.focus();
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        request?.abort();
      },
      { once: true },
    );
    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearTimeout(timer);
      request?.abort();
      if (query.length < 2) {
        draw(cities.filter((city) => city.name.toLowerCase().includes(query.toLowerCase())));
        return;
      }
      list.replaceChildren(element('p', { class: 'empty', text: 'Searching cities…' }));
      status.textContent = 'Searching cities';
      timer = setTimeout(async () => {
        const search = new AbortController();
        request = search;
        const results = await searchCities(query, { signal: search.signal });
        if (!search.signal.aborted && !signal.aborted) draw(results);
      }, 200);
    });
  }

  return {
    chooseCity,
    editProfile(profile, onSave) {
      open('Your household', profileMarkup);
      setOptions(byId('profile-household'), householdLabels, profile.household);
      setOptions(byId('profile-commute'), commuteLabels, profile.commute);
      byId('profile-distance').value = profile.distanceKm;
      byId('profile-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const next = normalizeProfile({
          household: byId('profile-household').value,
          commute: byId('profile-commute').value,
          distanceKm: Number(byId('profile-distance').value),
        });
        close();
        onSave(next);
      });
    },
    chooseMode(source, onSelect) {
      open('Air data mode', modeMarkup);
      for (const button of content.querySelectorAll('[data-mode]')) {
        const { mode } = button.dataset;
        button.setAttribute('aria-pressed', String((mode === 'demo') === (source === 'demo')));
        button.addEventListener('click', () => {
          close();
          onSelect(mode);
        });
      }
    },
    showMethodology() {
      open('Data & methodology', methodologyMarkup);
    },
    showCopyText(brief) {
      open(
        'Copy your brief',
        `
        <label for="copy-text" class="dialog-help">Select and copy the bulletin below.</label>
        <textarea class="field" rows="9" id="copy-text" readonly></textarea>
      `,
      );
      const field = byId('copy-text');
      field.value = brief;
      field.focus();
      field.select();
    },
  };
}
