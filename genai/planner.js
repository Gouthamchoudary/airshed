import checkpoint from './weights.js';

// The trained decoder predicts an action token, then conditions the next
// prediction on that token, current air conditions, household, and question.
const vocabulary = new Map(checkpoint.features.map((word, index) => [word, index]));
/** @param {{data: string, scale: number}} tensor */
function unpack({ data, scale }) {
  const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Float32Array.from(
    { length: bytes.length / 2 },
    (_, i) => view.getInt16(i * 2, true) * scale,
  );
}
const layers = checkpoint.layers.map(({ weights, bias }) => ({
  weights: unpack(weights),
  bias: unpack(bias),
  width: weights.shape[1],
}));

/** @param {Float32Array} input */
function forward(input) {
  let vector = input;
  for (const [i, layer] of layers.entries()) {
    const output = new Float32Array(layer.bias);
    for (let row = 0; row < vector.length; row++) {
      if (vector[row] === 0) continue;
      for (let col = 0; col < layer.width; col++) {
        output[col] += vector[row] * layer.weights[row * layer.width + col];
      }
    }
    vector = i === 0 ? output.map((value) => Math.max(0, value)) : output;
  }
  return vector;
}

/** @param {number} aqi */
function airBand(aqi) {
  if (aqi <= 100) return 'low';
  if (aqi <= 150) return 'elevated';
  if (aqi <= 200) return 'high';
  if (aqi <= 300) return 'severe';
  return 'hazardous';
}

/** @type {Record<string, string>} */
const synonyms = {
  grandma: 'elderly',
  grandparent: 'elderly',
  grandparents: 'elderly',
  mum: 'family',
  mom: 'family',
  kid: 'kids',
  child: 'children',
  toddler: 'children',
  jogging: 'jog',
  football: 'sports',
  schoolbus: 'pickup',
  neighbourhood: 'neighborhood',
  neighbour: 'neighbours',
  housing: 'apartment',
  housingblock: 'neighborhood',
  ventilation: 'ventilate',
  commuting: 'commute',
  cycling: 'bicycle',
  bicycle: 'bike',
  driving: 'drive',
  biking: 'bike',
  masks: 'mask',
  respirators: 'respirator',
  purifiers: 'purifier',
  filtering: 'filter',
  kitchen: 'cooking',
  cooking: 'cook',
  frying: 'fry',
  incense: 'candles',
  minimise: 'reduce',
  grandmother: 'elderly',
  walking: 'walk',
  costless: 'free',
};

/**
 * @param {string} question
 * @param {number} aqi
 * @param {Pick<import('../types/contracts.js').Profile, 'household' | 'commute'>} profile
 * @returns {string[]}
 */
export function decodeActions(question, aqi, profile) {
  const tokens = question.toLowerCase().match(/[a-z0-9]+/g) || [];
  const context = new Set(tokens);
  for (const word of tokens) if (Object.hasOwn(synonyms, word)) context.add(synonyms[word]);
  context.add('band:' + airBand(aqi));
  context.add('group:' + profile.household);
  context.add('mode:' + profile.commute);
  const features = new Float32Array(vocabulary.size);
  for (const word of context) {
    const index = vocabulary.get(word);
    if (index !== undefined) features[index] = 1;
  }
  /** @type {string[]} */
  const actions = [];
  let previous = 'start';
  for (let step = 0; step < 3; step++) {
    const input = new Float32Array(features);
    const previousIndex = vocabulary.get('prev:' + previous);
    if (previousIndex === undefined) break;
    input[previousIndex] = 1;
    const scores = forward(input);
    let bestToken = 'end';
    let bestScore = -Infinity;
    for (const [index, token] of checkpoint.actions.entries()) {
      if (actions.includes(token) || (step === 0 && token === 'end')) continue;
      if (scores[index] > bestScore) {
        bestScore = scores[index];
        bestToken = token;
      }
    }
    if (bestToken === 'end') break;
    previous = bestToken;
    actions.push(previous);
  }
  return actions;
}
