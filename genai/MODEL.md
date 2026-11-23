# Airshed on-device planner

Airshed can generate a new action sequence for a household without sending its question or profile to a server. The model generates structured action tokens. An evidence-grounded renderer turns each token into guidance using the selected city's forecast, the household profile and transport assumptions.

## Architecture

The decoder is a feed-forward neural network used autoregressively. A 311-element input encodes words from the question, AQI band, household type, travel mode and previous generated action. A 48-unit ReLU layer predicts the next action or end token. Greedy decoding stops at the end token or after three distinct actions. The model has 15,564 learned parameters. Signed 16-bit weights and their scaling factors are embedded in a 44,755-byte JavaScript module.

Training uses 11,104 original synthetic next-action examples, sampled across five air-quality bands, four household profiles and four modes of travel. No user questions or personal observations are training data. The reproducible NumPy/scikit-learn training script constructs all examples and exports the browser checkpoint. The browser runtime has no machine-learning library dependency.

## Interpretation and limits

The model is an English-language, task-specific action planner. The labels identify the actual generation path for each answer. On compatible browsers with an already available Chrome Prompt API model, Gemini Nano can rewrite the approved actions. The cloud option explicitly sends the displayed planning context to the server. The local path can continue if the cloud request fails.

The planner can misunderstand vague questions or multiple intents. This is a planning prototype with manually specified training targets and scoped regression checks. It has not undergone clinical validation or population-level exposure assessment. Airshed grounds action wording and sources, keeps simulated data labelled, routes urgent symptom phrases to urgent help, and advises checking local guidance.

The dashboard's daily checklist uses explicit AQI and profile rules. The trained decoder powers free-text questions. Canadian, Indian and US AQI numbers use different bands. Airshed consistently labels and uses the US scale supplied by Open-Meteo.

## Reproduction

Run `node --test genai/engine.test.mjs` from the project root for the network-independent checks. These include AQI boundaries, timing around midnight, local caching, malformed API response handling, city-search deduplication, protected groups, masked network access, carbon calculations and held-out question phrasings.

To regenerate weights, use Python with NumPy 2.1 and scikit-learn 1.6.1 and run `python genai/train.py`. The seed is fixed. Library or CPU floating-point differences may change the final checkpoint slightly.

## Evidence

- Outdoor exertion and US AQI interpretation come from AirNow. [Particle pollution guide](https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf)
- Indoor source control and filtration use EPA guidance. [Indoor particles](https://www.epa.gov/indoor-air-quality-iaq/sources-indoor-particulate-matter-pm) · [Air cleaners](https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home)
- The vehicle baseline is an EPA US passenger-car average. Bus fuel use and occupancy are explicit illustrative assumptions. [Passenger vehicles](https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle) · [Fuel emission factors](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references)
- The outdoor feed is the modeled forecast supplied by Open-Meteo and the Copernicus Atmosphere Monitoring Service. [CAMS attribution and forecast documentation](https://open-meteo.com/en/docs/air-quality-api)
