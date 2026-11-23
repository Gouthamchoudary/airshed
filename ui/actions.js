import { getPlan } from '../domain/guidance.js';
import { householdLabels } from '../domain/profile.js';
import { readJSON, writeJSON } from '../lib/storage.js';
import { byId, element, eventElement, pressState, sourceLink } from './dom.js';
import { icon } from './icons.js';

/** @typedef {import('../types/contracts.js').Action} Action */
/** @typedef {import('../types/contracts.js').AirForecast} AirForecast */
/** @typedef {import('../types/contracts.js').Profile} Profile */

const design = {
  Routine: { icon: 'route', fill: '#e6ecdc', ink: '#577141' },
  Indoors: { icon: 'house', fill: '#f6e7d5', ink: '#93623b' },
  Community: { icon: 'users', fill: '#e6ebf4', ink: '#536e92' },
};

/** @param {AirForecast} air @param {Profile} profile */
function progressKey(air, profile) {
  const { city, asOf, source } = air;
  return `airshed-v1:actions:${city.lat}:${city.lon}:${asOf.slice(0, 10)}:${source}:${profile.household}:${profile.commute}`;
}

/** @param {Action[]} actions @param {string} filter */
function orderActions(actions, filter) {
  if (filter !== 'All') return actions.filter((action) => action.group === filter);
  const buckets = Object.keys(design).map((group) =>
    actions.filter((action) => action.group === group),
  );
  const length = Math.max(...buckets.map((bucket) => bucket.length));
  return Array.from({ length }, (_, index) =>
    buckets.flatMap((bucket) => bucket.slice(index, index + 1)),
  ).flat();
}

/**
 * @param {HTMLElement} card
 * @param {HTMLButtonElement} button
 * @param {Action} action
 * @param {boolean} done
 */
function updateCompletion(card, button, action, done) {
  card.dataset.done = String(done);
  button.setAttribute('aria-pressed', String(done));
  button.setAttribute('aria-label', `Complete action: ${action.title}`);
  button.title = done ? 'Mark unfinished' : 'Mark done';
  button.replaceChildren(icon(done ? 'check' : 'plus'));
}

/** @param {Action} action @param {boolean} done */
function createCard(action, done) {
  const look = design[action.group] ?? design.Routine;
  const card = element('article', { class: 'plan-card', 'data-action-id': action.id });
  card.style.setProperty('--group-fill', look.fill);
  card.style.setProperty('--group-ink', look.ink);
  const top = element('div', { class: 'action-top' });
  const badge = element('span', { class: 'group-icon' });
  badge.append(icon(look.icon));
  const button = element('button', { type: 'button', class: 'check-action', 'data-id': action.id });
  top.append(badge, element('span', { class: 'action-kind', text: action.group }), button);

  const detail = element('details');
  detail.append(
    element('summary', { text: 'Why this helps' }),
    element('p', { text: action.impact }),
  );
  const link = sourceLink(action.sourceUrl, 'Read the source');
  if (link) detail.append(link);

  card.append(
    top,
    element('h3', { text: action.title }),
    element('p', { class: 'action-text', text: action.action }),
    detail,
  );
  updateCompletion(card, button, action, done);
  return card;
}

export function createActionPlan() {
  const list = byId('plan-list');
  const filters = document.querySelectorAll('[data-filter]');
  let filter = 'All';
  /** @type {Action[]} */
  let actions = [];
  /** @type {Set<string>} */
  let completed = new Set();
  let key = '';

  function updateCount() {
    const done = actions.filter((action) => completed.has(action.id)).length;
    byId('plan-progress').textContent = `${done} of ${actions.length} done`;
  }

  function drawCards() {
    const opened = new Set(
      [...list.querySelectorAll('details[open]')].map((detail) =>
        detail.closest('[data-action-id]')?.getAttribute('data-action-id'),
      ),
    );
    const cards = orderActions(actions, filter).map((action) => {
      const card = createCard(action, completed.has(action.id));
      const detail = card.querySelector('details');
      if (detail) detail.open = opened.has(action.id);
      return card;
    });
    list.replaceChildren(
      ...(cards.length
        ? cards
        : [element('p', { class: 'empty', text: 'No actions in this category for this brief.' })]),
    );
  }

  for (const button of filters) {
    button.addEventListener('click', () => {
      filter = button.getAttribute('data-filter') ?? 'All';
      pressState(filters, 'filter', filter);
      drawCards();
    });
  }

  list.addEventListener('click', (event) => {
    const button = eventElement(event, '.check-action');
    if (!(button instanceof HTMLButtonElement)) return;
    const card = button.closest('article');
    if (!card) return;
    const action = actions.find((item) => item.id === button.dataset.id);
    if (!action) return;
    const complete = !completed.has(action.id);
    if (complete) completed.add(action.id);
    else completed.delete(action.id);
    writeJSON(key, [...completed]);
    // Keep keyboard focus and any open impact explanation on the same card.
    updateCompletion(card, button, action, complete);
    updateCount();
  });

  return {
    /** @param {AirForecast} air @param {Profile} profile */
    update(air, profile) {
      key = progressKey(air, profile);
      const stored = readJSON(key, []);
      completed = new Set(
        Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : [],
      );
      actions = getPlan(air, profile);
      byId('profile-summary').textContent = householdLabels[profile.household];
      updateCount();
      drawCards();
    },
  };
}
