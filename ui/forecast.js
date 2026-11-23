import { byId, element, pressState } from './dom.js';
import { formatLocal, formatNumber } from './format.js';

const metrics = {
  aqi: { title: 'AQI', digits: 0, unit: 'US AQI' },
  pm25: { title: 'PM2.5', digits: 1, unit: 'µg/m³ PM2.5' },
};

const colors = [
  [50, '#739c73'],
  [100, '#b2a04c'],
  [150, '#ce8e4b'],
  [200, '#c96e5e'],
  [300, '#97679a'],
  [Infinity, '#823c58'],
];

function colorFor(aqi) {
  return colors.find(([max]) => aqi <= max)?.[1] ?? '#739c73';
}

function sourceCaption(air, mode, loading, asOf) {
  if (loading) return 'Checking the live forecast · showing a simulated winter scenario.';
  if (air.source === 'demo') {
    return mode === 'live'
      ? 'Live forecast unavailable · showing a simulated winter scenario.'
      : 'Winter smog simulation · illustrative hourly values.';
  }
  const source =
    air.source === 'cached'
      ? 'Cached Open-Meteo / CAMS forecast'
      : 'Open-Meteo / CAMS model forecast';
  return asOf ? `${source} · ${asOf} local` : source;
}

export function createForecastView({ onChooseMode, onSwitchMode }) {
  const chart = byId('chart');
  const metricButtons = document.querySelectorAll('[data-metric]');
  let air;
  let mode;
  let loading = false;
  let metric = 'aqi';
  let hours = [];
  let selectedHour = null;
  let lowestHour = 0;
  let bars = [];

  const hourLabel = (hour) =>
    formatLocal(hour.time, air.timezone, { hour: '2-digit', minute: '2-digit' });
  const readingLabel = (hour) =>
    `${formatNumber(hour[metric], metrics[metric].digits)} ${metrics[metric].unit}`;

  function updateInsight() {
    if (!hours.length) {
      byId('forecast-label').textContent = 'Hourly outlook';
      byId('forecast-detail').textContent = 'Check back when the model updates.';
      return;
    }
    const hour = hours[selectedHour ?? lowestHour];
    const weekday = formatLocal(hour.time, air.timezone, { weekday: 'short' });
    byId('forecast-label').textContent =
      selectedHour === null ? `Lowest forecast ${metrics[metric].title}` : 'Selected forecast hour';
    byId('forecast-detail').textContent =
      `${weekday} ${hourLabel(hour)} · ${readingLabel(hour)}`.trim();
  }

  function selectHour(index) {
    if (!bars[index]) return;
    selectedHour = index;
    for (const [position, bar] of bars.entries()) {
      bar.tabIndex = position === index ? 0 : -1;
      bar.setAttribute('aria-pressed', String(position === index));
    }
    updateInsight();
    bars[index].focus({ preventScroll: true });
  }

  function drawChart() {
    const restoreFocus = chart.contains(document.activeElement);
    pressState(metricButtons, 'metric', metric);
    hours = air.hours.filter((hour) => Number.isFinite(hour[metric])).slice(0, 24);
    selectedHour = null;
    if (!hours.length) {
      bars = [];
      chart.replaceChildren(
        element('p', { class: 'empty', text: 'Hourly values are unavailable for this forecast.' }),
      );
      updateInsight();
      return;
    }

    const values = hours.map((hour) => hour[metric]);
    lowestHour = values.indexOf(Math.min(...values));
    const max = Math.max(...values, 1);
    const step = max > 100 ? 50 : max > 20 ? 10 : 5;
    const scale = Math.ceil(max / step) * step;

    const yAxis = element('div', { class: 'y-axis', 'aria-hidden': 'true' });
    for (const fraction of [1, 0.5, 0]) {
      yAxis.append(
        element('span', {
          style: `bottom: ${fraction * 100}%`,
          text: formatNumber(scale * fraction, 1),
        }),
      );
    }
    const plot = element('div', { class: 'plot' });
    bars = hours.map((hour, index) => {
      const date = formatLocal(hour.time, air.timezone, { weekday: 'long' });
      const label = `${date} ${hourLabel(hour)} · ${readingLabel(hour)}`.trim();
      const bar = element('button', {
        class: 'bar',
        type: 'button',
        'data-hour': index,
        title: label,
        'aria-label': label,
        'aria-pressed': 'false',
        tabindex: index === lowestHour ? 0 : -1,
      });
      bar.style.setProperty('--h', `${Math.max(1, (hour[metric] / scale) * 100)}%`);
      bar.style.setProperty('--bar', colorFor(hour.aqi));
      return bar;
    });
    plot.append(...bars);
    const plotRow = element('div', { class: 'plot-row' });
    plotRow.append(yAxis, plot);
    const xAxis = element('div', { class: 'x-axis', 'aria-hidden': 'true' });
    const last = hours.length - 1;
    for (const index of new Set([0, Math.round(last / 3), Math.round((last * 2) / 3), last])) {
      xAxis.append(element('span', { text: hourLabel(hours[index]) }));
    }
    chart.replaceChildren(plotRow, xAxis);
    if (restoreFocus) bars[lowestHour].focus({ preventScroll: true });
    updateInsight();
  }

  chart.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hour]');
    if (button) selectHour(Number(button.dataset.hour));
  });
  chart.addEventListener('keydown', (event) => {
    const button = event.target.closest('[data-hour]');
    if (!button) return;
    const current = Number(button.dataset.hour);
    const destinations = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: bars.length - 1,
    };
    if (!Object.hasOwn(destinations, event.key)) return;
    event.preventDefault();
    selectHour(Math.min(bars.length - 1, Math.max(0, destinations[event.key])));
  });
  for (const button of metricButtons) {
    button.addEventListener('click', () => {
      metric = button.dataset.metric;
      drawChart();
    });
  }
  byId('air-source').addEventListener('click', () => onChooseMode(air.source));
  byId('switch-mode').addEventListener('click', () => {
    const next = mode === 'demo' || (air.source === 'demo' && !loading) ? 'live' : 'demo';
    onSwitchMode(next);
  });

  return {
    update(nextAir, requestedMode, pending = false) {
      air = nextAir;
      mode = requestedMode;
      loading = pending;
      const { city, source, asOf, timezone, aqi, pm25, pm10, category } = air;
      const day = formatLocal(asOf, timezone, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const timestamp = formatLocal(asOf, timezone, {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      });
      byId('current-city').textContent = city.name;
      byId('city-button').setAttribute('aria-label', `Change location, currently ${city.name}`);
      byId('date').textContent = source === 'demo' && day ? `Scenario · ${day}` : day;
      byId('aqi').textContent = formatNumber(aqi);
      byId('pm25').textContent = formatNumber(pm25, 1);
      byId('pm10').textContent = formatNumber(pm10, 1);
      byId('category').replaceChildren(element('span', { class: 'severity-dot' }), category.label);
      byId('category').style.setProperty('--severity', colorFor(aqi));
      byId('air-source').textContent = {
        demo: 'Winter scenario',
        cached: 'Saved forecast',
        live: 'Model forecast',
      }[source];
      byId('air-source').dataset.mode = source;
      byId('source-caption').textContent = sourceCaption(air, mode, loading, timestamp);
      byId('switch-mode').textContent =
        mode === 'demo'
          ? 'View live forecast'
          : source === 'demo' && !loading
            ? 'Retry live forecast'
            : 'Try winter scenario';
      byId('forecast-zone').textContent = 'City local time';
      drawChart();
    },
  };
}
