// Stable entry point for consumers of Airshed's planning engine.
export { cities, isCity, searchCities } from './domain/geography.js';
export { categoryFor, getAir, getDemoAir } from './domain/air-quality.js';
export { getImpact } from './domain/impact.js';
export { getCommunityBrief, getPlan, sources } from './domain/guidance.js';
export { askAssistant } from './domain/assistant.js';
