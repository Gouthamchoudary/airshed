import { boundedNumber, record } from '../lib/data.js';

export const householdLabels = {
  family: 'Family with children',
  adults: 'Adult household',
  sensitive: 'Pollution-sensitive household',
  seniors: 'Older adults',
};

export const commuteLabels = {
  car: 'Private car',
  transit: 'Public transit',
  walk: 'Walk',
  cycle: 'Cycle',
};

/** @param {unknown} value @returns {value is import('../types/contracts.js').Household} */
export function isHousehold(value) {
  return typeof value === 'string' && Object.hasOwn(householdLabels, value);
}

/** @param {unknown} value @returns {value is import('../types/contracts.js').Commute} */
export function isCommute(value) {
  return typeof value === 'string' && Object.hasOwn(commuteLabels, value);
}

/** @param {unknown} profile @returns {import('../types/contracts.js').Profile} */
export function normalizeProfile(profile) {
  const { household, commute, distanceKm } = record(profile);
  return {
    household: isHousehold(household) ? household : 'family',
    commute: isCommute(commute) ? commute : 'car',
    distanceKm: boundedNumber(distanceKm ?? 5, 0, 10000, 5),
  };
}
