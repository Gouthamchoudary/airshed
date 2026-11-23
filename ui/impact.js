import { getImpact } from '../domain/impact.js';
import { byId } from './dom.js';
import { formatNumber } from './format.js';

export function createImpactView() {
  const distance = byId('distance', 'input');
  const alternative = byId('alternative', 'select');
  const households = byId('households', 'input');
  const result = byId('impact-result');
  const method = byId('impact-method');
  const cue = byId('travel-cue');
  let aqi = 0;

  function render() {
    const kilometers = Number(distance.value);
    const selection = alternative.value;
    const count = Number(households.value);
    const valid = count >= 1 && count <= 1000 && Number.isInteger(count);
    distance.setAttribute('aria-valuetext', `${kilometers} kilometres`);
    byId('distance-value').textContent = `${kilometers} km`;
    households.setAttribute('aria-invalid', String(!valid));
    byId('impact-validation').textContent = valid ? '' : 'Enter a whole number from 1 to 1,000.';
    if (valid) {
      const impact = getImpact(kilometers, selection, count);
      result.textContent = `${formatNumber(impact.kg, 2)} kg`;
      method.textContent = `Solo car: ${formatNumber(impact.baselineKg, 2)} kg. Alternative: ${formatNumber(impact.alternativeKg, 2)} kg. ${impact.assumption}`;
    } else {
      result.textContent = '–';
      method.textContent = 'Enter 1 to 1,000 households to calculate this trip.';
    }
    const warn = aqi > 100 && (selection === 'cycle' || selection === 'walk');
    cue.hidden = !warn;
    cue.textContent = warn
      ? 'Outdoor exertion can increase exposure. On high-smog days, postpone the trip or use enclosed transport.'
      : '';
  }

  for (const field of [distance, alternative, households]) field.addEventListener('input', render);
  return {
    /** @param {import('../types/contracts.js').AirForecast} air */
    update(air) {
      aqi = air.aqi;
      render();
    },
    /** @param {number} kilometers */
    setDistance(kilometers) {
      distance.value = String(kilometers);
    },
  };
}
