import { getAir, getDemoAir } from './domain/air-quality.js';
import { cities, isCity } from './domain/geography.js';
import { boundedNumber } from './domain/impact.js';
import { normalizeProfile } from './domain/profile.js';
import { readJSON, writeJSON } from './lib/storage.js';
import { createActionPlan } from './ui/actions.js';
import { createChat } from './ui/chat.js';
import { createCommunityView } from './ui/community.js';
import { createDialogs } from './ui/dialogs.js';
import { byId } from './ui/dom.js';
import { createForecastView } from './ui/forecast.js';
import { populateIcons } from './ui/icons.js';
import { createImpactView } from './ui/impact.js';
import { bindNavigation } from './ui/navigation.js';

const CITY_KEY = 'airshed-v1:city';
const PROFILE_KEY = 'airshed-v1:profile';

populateIcons();

const storedCity = readJSON(CITY_KEY);
const storedProfile = readJSON(PROFILE_KEY, {});
let city = isCity(storedCity) ? storedCity : cities[0];
let profile = normalizeProfile({
  ...storedProfile,
  distanceKm: boundedNumber(Number(storedProfile.distanceKm) || 8, 1, 60, 8),
});
let mode = new URLSearchParams(location.search).get('demo') === '1' ? 'demo' : 'live';
let air;
let request;
let toastTimer;

const dialogs = createDialogs();
const forecastView = createForecastView({
  onChooseMode: (source) => dialogs.chooseMode(source, loadConditions),
  onSwitchMode: loadConditions,
});
const plan = createActionPlan();
const chat = createChat();
const impact = createImpactView();
const community = createCommunityView({ showToast, showCopyText: dialogs.showCopyText });

function showToast(message) {
  clearTimeout(toastTimer);
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function updatePlan(loading = false) {
  plan.update(air, profile);
  impact.update(air);
  community.update(air, profile);
  chat.setContext(air, profile, loading);
}

function render(loading = false) {
  forecastView.update(air, mode, loading);
  updatePlan(loading);
}

async function loadConditions(nextMode) {
  mode = nextMode;
  request?.abort();
  request = null;
  air = getDemoAir(city);
  if (mode === 'demo') {
    render();
    return;
  }

  const controller = new AbortController();
  request = controller;
  render(true);
  try {
    const forecast = await getAir(city, { signal: controller.signal });
    if (request !== controller) return;
    air = forecast;
  } catch {
    if (request !== controller) return;
    // An unexpected error leaves the already labeled winter scenario available.
  } finally {
    if (request === controller) {
      request = null;
      render();
    }
  }
}

function chooseCity() {
  dialogs.chooseCity((nextCity) => {
    city = nextCity;
    writeJSON(CITY_KEY, city);
    loadConditions(mode);
  });
}

function editProfile() {
  dialogs.editProfile(profile, (nextProfile) => {
    profile = nextProfile;
    writeJSON(PROFILE_KEY, profile);
    impact.setDistance(profile.distanceKm);
    updatePlan(Boolean(request));
    showToast('Household plan updated');
  });
}

byId('city-button').addEventListener('click', chooseCity);
for (const id of ['profile-button', 'edit-profile'])
  byId(id).addEventListener('click', editProfile);
for (const id of ['source-button', 'footer-source'])
  byId(id).addEventListener('click', dialogs.showMethodology);
impact.setDistance(profile.distanceKm);
bindNavigation();
loadConditions(mode);
