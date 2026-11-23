import test from 'node:test';
import assert from 'node:assert/strict';
import brief from '../api/brief.js';

const context = {
  question: 'My child has a football match. What should we change?',
  city: 'New Delhi',
  aqi: 210,
  source: 'demo',
  household: 'family',
  commute: 'car',
  actions: [
    {
      title: 'Move practice indoors',
      action: 'Use a cleaner indoor space.',
      impact: 'Reduces time outdoors during the peak.',
    },
  ],
};
let sequence = 0;
function request(body = context, changes = {}) {
  return {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      host: 'example.test',
      origin: 'https://example.test',
    },
    socket: { remoteAddress: 'client-' + ++sequence },
    ...changes,
  };
}
async function run(req) {
  const res = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    },
  };
  await brief(req, res);
  return res;
}
test('requires JSON POST and rejects cross-origin browser requests', async () => {
  assert.equal((await run(request(context, { method: 'GET' }))).code, 405);
  assert.equal(
    (
      await run(
        request(context, { headers: { host: 'example.test', origin: 'https://other.test' } }),
      )
    ).code,
    403,
  );
  assert.equal((await run(request(context, { headers: {} }))).code, 415);
  for (const invalid of ['application/jsonp', 'application/json-patch+json']) {
    const headers = { ...request().headers, 'content-type': invalid };
    assert.equal((await run(request(context, { headers }))).code, 415);
  }
});
test('rejects malformed input, unknown context, non-finite AQI and large payloads before inference', async () => {
  for (const input of [
    '{',
    { ...context, source: 'station measurement' },
    { ...context, aqi: null },
    { ...context, actions: [null] },
    { ...context, question: ' ' },
    { ...context, commute: 'jet' },
  ]) {
    assert.equal((await run(request(input))).code, 400);
  }
  assert.equal((await run(request('x'.repeat(8200)))).code, 413);
});
test('sends bounded context to the fixed model and excludes extra fields', async (t) => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ choices: [{ message: { content: 'Move the match indoors.' } }] });
  });
  const req = request({
    ...context,
    exactAddress: 'omit-me',
    actions: [{ ...context.actions[0], extra: 'omit-me' }],
  });
  req.headers['x-vercel-oidc-token'] = 'test-only';
  const res = await run(req);
  assert.equal(res.code, 200);
  assert.equal(res.payload.mode, 'Gemini 2.5 Flash-Lite');
  assert.equal(sent.model, 'google/gemini-2.5-flash-lite');
  assert.equal(JSON.parse(sent.messages[1].content).aqi, 210);
  assert.ok(!JSON.stringify(sent).includes('omit-me'));
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('time-outs and upstream failures expose no upstream details', async (t) => {
  const upstream = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('sensitive internal error', { status: 502 }),
  );
  const req = request();
  req.headers['x-vercel-oidc-token'] = 'test-only';
  assert.equal((await run(req)).code, 503);
  upstream.mock.mockImplementation(async () => {
    throw new Error('internal network detail');
  });
  const res = await run(req);
  assert.equal(res.code, 503);
  assert.ok(!JSON.stringify(res.payload).includes('internal'));
});
test('applies a per-client burst limit before calling the gateway', async () => {
  const req = request();
  const originalKey = process.env.AI_GATEWAY_API_KEY,
    originalToken = process.env.VERCEL_OIDC_TOKEN;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  try {
    for (let attempt = 0; attempt < 8; attempt++) assert.equal((await run(req)).code, 503);
    const limited = await run(req);
    assert.equal(limited.code, 429);
    assert.equal(limited.headers['Retry-After'], '60');
  } finally {
    if (originalKey !== undefined) process.env.AI_GATEWAY_API_KEY = originalKey;
    if (originalToken !== undefined) process.env.VERCEL_OIDC_TOKEN = originalToken;
  }
});
