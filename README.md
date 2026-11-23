# Airshed

**PromptWars Challenge 6 · Urban Air Quality Assistant**

[Open Airshed](https://airshed-fieldguide.vercel.app/) · [Watch the product demo](https://airshed-fieldguide.vercel.app/demo.html)

A city forecast tells you the air could be unhealthy. Airshed helps a household decide what to change that day. It combines hourly air forecasts with household and commute preferences, then explains the expected effect of each action.

## Try the full flow

1. Search for your city or choose a preset. Review current modeled US AQI, PM2.5 and the next 24 hours in city time.
2. Choose **Try winter scenario** for a repeatable, clearly labeled smog episode.
3. Select a household and usual commute. Filter the actions to indoor air and expand **Why this helps**.
4. Ask “How can we plan a cleaner school run?” or “When should we open the windows?” Try a different question to compare generated actions.
5. In **Impact lab**, set 12 km, public transit and 10 households to reproduce the illustrative 22.73 kg tailpipe CO₂ savings in the demo.
6. Copy the bulletin for a school or neighbourhood group. The bulletin carries its data source, local time, AQI and actions.

## How it works

| Layer | Responsibility |
| --- | --- |
| Forecast and city search | Open-Meteo geocoding and CAMS air quality. The dashboard distinguishes fresh model data, cached model data and a synthetic winter scenario. |
| Daily plan | Rules combine US AQI, household sensitivity, travel mode and distance with sourced, practical actions. |
| Ask Airshed | A quantized autoregressive neural planner generates action sequences from the question, AQI band, household and travel mode. The renderer attaches vetted action text and exact local values. |
| Optional AI | Supported browsers can phrase the grounded actions with Gemini Nano on-device when it is installed. The opt-in cloud endpoint supports Gemini 2.5 Flash-Lite through a configured Vercel AI Gateway. The hosted project works with the bundled model when the gateway is unavailable. |
| Impact lab | A transparent tailpipe CO₂ comparison estimates the effect of replacing a solo car trip. |
| Community bulletin | A source-labeled, human-readable brief can be copied or downloaded as text. |

The [model card](genai/MODEL.md) describes the checkpoint, training data, reproducible training and limitations. The browser model is ~45 KB, runs without a separate ML runtime, and keeps the question and household profile on-device by default. Emergency or medical questions route to fixed guidance before model inference.

## Assumptions

- CAMS values are outdoor, city-scale estimates. Conditions can vary on an individual street or inside a building. The index shown uses US AQI bands.
- A lower forecast hour can still be unhealthy. Advice considers the absolute AQI and household sensitivity.
- A cached forecast is retained for up to six hours. The example scenario uses synthetic winter-smog values and carries its own label.
- The transport baseline uses the EPA average of 400 g CO₂ per mile for a passenger vehicle. The example diesel bus uses 0.33 L/km, 15 passengers and 2.69 kg CO₂/L. Results vary with actual vehicles, occupancy and routes. Energy production, infrastructure and changes to outdoor concentration are outside this comparison.
- Household settings, forecast cache and checked actions use browser storage. City searches and forecast coordinates go to Open-Meteo. Online AI sends the questionnaire and selected context only after opt-in.

## Run and verify

Use Node.js 22+ and Python 3 for the local static server. No npm packages or credentials are needed for the dashboard or on-device planner.

```sh
python -m http.server 4187
npm test
```

Open http://localhost:4187. Vercel deploys the static files and the optional Node API from the repository root. To enable cloud Gemini, use an eligible Vercel AI Gateway account with OIDC or configure a server-only AI_GATEWAY_API_KEY. The endpoint validates schema, caps request size and applies a warm-instance burst limit.

Automated tests cover AQI boundaries, forecast failures and cache fallback, city search, context-dependent guidance, emissions arithmetic, held-out question phrasings, consent and cloud service errors. Desktop and mobile Chrome checks cover location search, scenario switching, profile changes, generated answers, the impact calculator and clipboard sharing.

## Sources

- [Open-Meteo air quality API and CAMS attribution](https://open-meteo.com/en/docs/air-quality-api)
- [AirNow US AQI categories](https://www.airnow.gov/aqi/aqi-basics/)
- [AirNow particle pollution guidance](https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf)
- [EPA indoor particle sources](https://www.epa.gov/indoor-air-quality-iaq/sources-indoor-particulate-matter-pm)
- [EPA home air cleaners](https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home)
- [EPA typical passenger vehicle emissions](https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle)
- [EPA school bus idle reduction](https://www.epa.gov/dera/school-bus-idle-reduction)
