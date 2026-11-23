import { boundedNumber } from './impact.js';

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

export function normalizeProfile(profile) {
  const { household, commute, distanceKm } = profile ?? {};
  return {
    household: Object.hasOwn(householdLabels, household) ? household : 'family',
    commute: Object.hasOwn(commuteLabels, commute) ? commute : 'car',
    distanceKm: boundedNumber(distanceKm ?? 5, 0, 10000, 5),
  };
}
