// EPA passenger-car and illustrative diesel-bus tailpipe factors.
const CAR_KG_PER_KM = 0.4 / 1.609344;
const BUS_KG_PER_PASSENGER_KM = ((10.18 / 3.785411784) * 0.33) / 15;
export function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
const round2 = (value) => Math.round(value * 100) / 100;

export function getImpact(km, alternative = 'transit', households = 1) {
  const distance = boundedNumber(km, 0, 10000, 0);
  const people = Math.floor(boundedNumber(households, 0, 10000, 1));
  const choices = {
    transit: [
      BUS_KG_PER_PASSENGER_KM,
      'Illustrative diesel bus: 0.33 L/km, 15 passengers, 2.69 kg CO₂/L.',
    ],
    carpool: [
      CAR_KG_PER_KM / 2,
      'Two riders share the same car trip and its tailpipe emissions equally.',
    ],
    walk: [0, 'Walking produces zero tailpipe CO₂.'],
    cycle: [0, 'Cycling produces zero tailpipe CO₂.'],
    remote: [0, 'An avoided trip produces zero tailpipe CO₂.'],
  };
  const selected = Object.hasOwn(choices, alternative) ? choices[alternative] : choices.transit;
  const baseline = people * distance * CAR_KG_PER_KM;
  const after = people * distance * selected[0];
  return {
    kg: round2(baseline - after),
    baselineKg: round2(baseline),
    alternativeKg: round2(after),
    assumption:
      'One solo-car trip per participating household. Baseline 0.249 kg CO₂/km (US EPA average). ' +
      selected[1] +
      ' Tailpipe only. Actual vehicles, occupancy and routes vary.',
  };
}
