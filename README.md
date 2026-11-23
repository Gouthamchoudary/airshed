# Airshed

**Plan your day around local air quality.**

Airshed turns hourly air forecasts into practical choices for your household, commute and community. Built for **PromptWars Challenge 6 · Urban Air Quality Assistant**.

[Try Airshed](https://airshed-fieldguide.vercel.app/) · [Watch the 47-second demo](https://drive.google.com/file/d/1UopXAB1ao_PbQ05wUL44oRefne3h_Zni/view)

## The demo

Three friends are getting ready to drive from Hyderabad to Goa. They check a simulated smog day, ask Airshed about the drive, and look up Panaji before making outdoor plans.

[Open the demo player](https://airshed-fieldguide.vercel.app/demo.html)

## What you can do

- **Plan the day.** Check hourly AQI, then get indoor air and travel suggestions tailored to your household.
- **Ask a follow-up.** The bundled on-device model builds answers from sourced actions and your local forecast. [Model card](genai/MODEL.md)
- **Compare and share.** Estimate tailpipe CO₂ for a travel swap, or copy a timestamped air brief for your group.

## Approach and architecture

1. **Get the local picture.** City search resolves coordinates, then Open-Meteo returns the CAMS forecast in that city's time.
2. **Apply decision rules.** US AQI, household sensitivity and commute choices drive the daily checklist. Each action links to its source.
3. **Answer a specific question.** A 45 KB autoregressive model generates action tokens on-device. A renderer joins the selected actions with local forecast values and their citations. [Model card](genai/MODEL.md)

The planning code is in [domain/](domain/), the browser interactions are in [ui/](ui/), and the shared data contracts are in [types/](types/contracts.d.ts). The optional online rewriting endpoint is [api/brief.js](api/brief.js).

<details>
<summary>View the architecture drawing</summary>

![Airshed architecture from local forecasts and household preferences to action plans, emissions comparisons and grounded AI answers.](assets/architecture.png)

</details>

## Run and verify

Run `python -m http.server 4187` and open [localhost:4187](http://localhost:4187). The daily plan and bundled model need no API key.

Use Node.js 22.13+ to run the development checks.

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs linting, strict JavaScript type checking, formatting checks, and unit tests. The browser suite covers keyboard interactions, accessibility, forecast changes and the demo. GitHub Actions runs both suites.

## Data and assumptions

- Airshed uses outdoor CAMS forecasts and **US AQI** bands. City-scale estimates can differ from street-level conditions. When live data is unavailable, Airshed labels a cached forecast or a simulated scenario. [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) · [AirNow](https://www.airnow.gov/aqi/aqi-basics/)
- The transport comparison estimates **tailpipe CO₂** using a solo-car baseline of 0.249 kg/km and an illustrative diesel bus at 0.33 L/km with 15 riders. Distance, vehicle and occupancy affect the result. [EPA vehicle baseline](https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle)
- Profile settings and on-device questions stay in the browser by default. Optional online AI requires explicit opt-in and a configured provider.
