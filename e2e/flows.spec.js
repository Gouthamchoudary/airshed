import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto('/?demo=1');
  await expect(page.locator('#aqi')).toHaveText('238');
});

test('the air forecast supports the keyboard and identifies the selected hour', async ({
  page,
}) => {
  const chart = page.getByRole('group', { name: 'Hourly air forecast' });
  await expect(chart.getByRole('button')).toHaveCount(24);
  const lowest = chart.locator('[tabindex="0"]');
  await expect(lowest).toHaveAccessibleName(/16:00.*164 US AQI/);
  await lowest.focus();
  await page.keyboard.press('ArrowRight');
  await expect(chart.getByRole('button', { pressed: true })).toBeFocused();
  await expect(page.locator('#forecast-detail')).toHaveText(/17:00.*168 US AQI/);
  await page.keyboard.press('Home');
  await expect(page.locator('#forecast-detail')).toHaveText(/08:00.*238 US AQI/);
  await page.getByRole('button', { name: 'PM2.5', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PM2.5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#forecast-label')).toHaveText('Lowest forecast PM2.5');
});

test('marking an action preserves focus, its explanation and saved progress', async ({ page }) => {
  const card = page.locator('.plan-card').first();
  const explanation = card.locator('details');
  await explanation.locator('summary').click();
  const completion = card.getByRole('button', { name: /Complete action/ });
  await completion.focus();
  await page.keyboard.press('Space');
  await expect(completion).toBeFocused();
  await expect(completion).toHaveAttribute('aria-pressed', 'true');
  await expect(explanation).toHaveAttribute('open', '');
  await expect(page.locator('#plan-progress')).toHaveText('1 of 5 done');
  await page.reload();
  await expect(page.locator('#plan-progress')).toHaveText('1 of 5 done');
});

test('a Panjim search updates the city, assistant and shared bulletin without cloud consent', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Change location/ }).click();
  const picker = page.getByRole('dialog', { name: 'Choose your city' });
  await picker.getByRole('searchbox').fill('Panjim');
  await picker.getByRole('button', { name: /Panaji/ }).click();
  await expect(page.getByRole('button', { name: /currently Panaji/ })).toBeFocused();
  await expect(page.locator('#brief-preview')).toContainText('Panaji');
  const cloudRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/brief') cloudRequests.push(request);
  });
  await page.getByRole('button', { name: 'Plan a cleaner school run' }).click();
  await expect(page.getByRole('log', { name: 'Conversation' }).locator('.assistant')).toContainText(
    'Panaji',
  );
  expect(cloudRequests).toHaveLength(0);

  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as text' }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe('airshed-panaji-brief.txt');
});

test('a late fetch from a previously selected city cannot replace the active forecast', async ({
  page,
}) => {
  let release;
  let resolveStarted;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  await page.route('https://air-quality-api.open-meteo.com/**', async (route) => {
    const lat = Number(new URL(route.request().url()).searchParams.get('latitude'));
    const delhi = lat > 20;
    if (delhi) {
      resolveStarted();
      await delayed;
    }
    const aqi = delhi ? 220 : 76;
    await route
      .fulfill({
        json: {
          timezone: 'Asia/Kolkata',
          current: { time: '2026-11-23T15:30', us_aqi: aqi, pm2_5: 40, pm10: 60 },
          hourly: { time: ['2026-11-23T15:00'], us_aqi: [aqi], pm2_5: [40] },
        },
      })
      .catch(() => {}); // The old fetch may have already been cancelled.
  });
  await page.getByRole('button', { name: 'View live forecast' }).click();
  await started;
  try {
    await page.getByRole('button', { name: /Change location/ }).click();
    await page.getByRole('button', { name: /Hyderabad India/ }).click();
    await expect(page.locator('#aqi')).toHaveText('76');
  } finally {
    release();
  }
  await expect(page.locator('#current-city')).toHaveText('Hyderabad');
  await expect(page.locator('#aqi')).toHaveText('76');
});

test('dashboard and household dialog pass the automated accessibility checks', async ({ page }) => {
  async function violations() {
    return (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations.map(({ id, nodes }) => ({
      id,
      elements: nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
  }
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Household', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your household' })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Household', exact: true })).toBeFocused();
});

test('a 390 px screen fits the forecast, plan and calculator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('heading', { name: 'The next 24 hours' })).toBeVisible();
  await page.getByLabel('Alternative').selectOption('walk');
  await expect(page.locator('#travel-cue')).toBeVisible();
  await page.getByLabel('Households').fill('0');
  await expect(page.getByLabel('Households')).toHaveAttribute('aria-invalid', 'true');
});

test('model weights are fetched only after the first assistant question', async ({ page }) => {
  const loads = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/genai/weights.js') loads.push(request);
  });
  await page.reload();
  await expect(page.locator('#aqi')).toHaveText('238');
  expect(loads).toHaveLength(0);
  await page.getByRole('button', { name: 'Plan a cleaner school run' }).click();
  await expect(page.getByRole('log', { name: 'Conversation' }).locator('.assistant')).toBeVisible();
  expect(loads).toHaveLength(1);
});
