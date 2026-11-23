"""Reproduce Airshed's compact conditional next-action model.

Run with Python 3, numpy 2.x and scikit-learn 1.6.x. No network or user
data is involved. Training cases are original, synthetic planning examples.
"""
from pathlib import Path
import base64
import json
import re

import numpy as np
from sklearn.neural_network import MLPClassifier
from threadpoolctl import threadpool_limits


# Phrasings are varied independently of AQI, household and means of travel.
PROMPTS = {
    "outdoors": [
        "Can we exercise outside?", "Should the kids play cricket after school?",
        "Taking my elderly father for a walk", "Is it safe to run in the park?",
        "My football practice and outdoor workout", "Can children go for a jog?",
        "What about a playground visit today?", "Walking the dog on a polluted day",
        "How should I change a sports lesson?", "Should I move recess indoors?",
        "Going out for a bike ride", "We want to exercise outdoors",
    ],
    "timing": [
        "What time is least polluted?", "When is the best hour for errands?",
        "Compare the next few hours", "When will the air improve?",
        "Find a lower exposure window", "Should I go later or now?",
        "Is afternoon better than morning?", "Can I reschedule my shopping trip?",
        "How does the forecast change?", "Is there a cleaner time to go outside?",
    ],
    "commute": [
        "How should I commute?", "Bus or car for my trip?", "A greener way to work",
        "Can we share a ride?", "How much carbon does my commute save?",
        "How can I cut transport emissions?", "Drive to the office or take the metro",
        "Compare my transport choices", "I ride a bicycle to work",
        "What's a lower emission school run?", "Can we carpool to school?",
    ],
    "cooking": [
        "How do I cook dinner?", "Should I fry food or steam it?", "My kitchen gets smoky",
        "How can I reduce fumes from a gas stove?", "Do I need the exhaust hood?",
        "Which cooking method emits fewer particles?", "What can I do while making lunch?",
        "Is frying bad for the air?", "Help with meals in my apartment",
    ],
    "budget": [
        "I cannot afford a purifier", "Low cost indoor air tips please",
        "Can I clean my room without buying a filter?", "No budget for equipment",
        "Cheap ways to cut dust at home", "Do incense sticks and candles matter?",
        "What can I do for free inside?", "Smoke-free home without spending money",
        "No air cleaner in my apartment", "We only have a damp mop",
    ],
    "ventilation": [
        "When should I open my windows?", "Should we ventilate our house?",
        "How do I air out the room?", "Close or open the balcony door?",
        "Should I let fresh air into my apartment?", "Is it time to shut windows?",
        "How should we manage ventilation?", "Is it safe to open windows now?",
    ],
    "filtration": [
        "Where should I put an air purifier?", "What is a HEPA filter?",
        "How do I make a cleaner air room?", "How can I improve my indoor air?",
        "Does a purifier clean a whole home?", "Where should my family sleep?",
        "Do I need a room air cleaner?", "Can a filter catch fine particles?",
    ],
    "respirator": [
        "Do I need a mask outside?", "Can a respirator filter PM2.5?",
        "What does an N95 do in smog?", "Does a cloth mask protect from particles?",
        "Will a mask fit my child?", "What should I wear over my nose outdoors?",
        "Is a surgical mask useful for pollution?", "How important is respirator fit?",
    ],
    "community": [
        "What can our community do together?", "Help our neighbours coordinate",
        "Draft a plan for our residents association", "Share local advice in the neighbourhood",
        "Help a group of families organise", "Write a brief for my neighborhood",
        "Message for our apartment building", "Can our society support older residents?",
        "Can volunteers check on older neighbours?", "Share advice with our block",
    ],
    "pickup": [
        "Can my school stop idling?", "Help a group of families at pickup",
        "What should our school gate volunteers do?", "Parents idle near the school",
        "Plan an idle free pickup", "Keep exhaust away from the school gate",
        "How can neighbours reduce engines at pickup?", "Drivers queue for children",
        "Tell our bus drivers about idling", "Drop off tips for the school community",
    ],
    "explain": [
        "What does AQI mean?", "Explain PM2.5 and PM10", "Why does smog matter?",
        "Is this an air monitor or a forecast?", "Why is particle pollution harmful?",
        "How do I interpret the reading?", "What are fine particles?",
        "What is an unhealthy air quality index?", "Can the forecast measure my room?",
    ],
    "daily": [
        "Build a plan for my day", "What should my family do today?",
        "Give us a daily routine", "Help us navigate winter smog",
        "Suggest sustainable alternatives", "How can we protect our household?",
        "Make a smog plan for today", "What should I change this morning?",
    ],
}
GROUPS = ["family", "adults", "sensitive", "seniors"]
MODES = ["car", "transit", "walk", "cycle"]
BANDS = ["low", "elevated", "high", "severe", "hazardous"]
ACTIONS = ["activity", "time", "travel", "cook", "dust", "window", "filter", "mask",
           "school", "checkin", "explain", "end"]


def target(intent, band, group, mode):
    poor = band in ("high", "severe", "hazardous")
    priority = "activity" if poor or group != "adults" else "travel"
    plans = {
        "outdoors": ["activity", "time"],
        "timing": ["time", "activity"],
        "commute": ["travel", "activity" if mode in ("walk", "cycle") and poor else "time"],
        "cooking": ["cook", "window"],
        "budget": ["dust", "cook"],
        "ventilation": ["window", "cook"],
        "filtration": ["filter", "dust"],
        "respirator": ["mask", "activity"],
        "community": ["school" if group in ("family", "adults") else "checkin",
                      "school" if group in ("seniors", "sensitive") else "checkin"],
        "pickup": ["school", "checkin"],
        "explain": ["explain", priority],
        "daily": [priority, "cook" if band in ("low", "elevated") else "filter",
                  "school" if group == "family" else "time"],
    }
    return list(dict.fromkeys(plans[intent])) + ["end"]


def tokens(question):
    return set(re.findall(r"[a-z0-9]+", question.lower()))


def train():
    vocab = sorted({word for examples in PROMPTS.values() for q in examples for word in tokens(q)})
    features = vocab + ["band:" + s for s in BANDS] + ["group:" + s for s in GROUPS]
    features += ["mode:" + s for s in MODES] + ["prev:" + s for s in ["start", *ACTIONS]]
    index = {word: idx for idx, word in enumerate(features)}
    rng = np.random.default_rng(601)
    rows, answer = [], []
    # Balanced random samples span 80 different household / air / travel contexts.
    for intent, prompts in PROMPTS.items():
        for prompt in prompts:
            words = tokens(prompt)
            for _ in range(32):
                band, group, mode = rng.choice(BANDS), rng.choice(GROUPS), rng.choice(MODES)
                context = words | {"band:" + band, "group:" + group, "mode:" + mode}
                previous = "start"
                for action in target(intent, band, group, mode):
                    row = np.zeros(len(features), dtype=np.float32)
                    for token in sorted(context | {"prev:" + previous}):
                        row[index[token]] = 1
                    rows.append(row)
                    answer.append(ACTIONS.index(action))
                    previous = action

    with threadpool_limits(limits=1):
        model = MLPClassifier(hidden_layer_sizes=(48,), max_iter=135, random_state=601,
                              learning_rate_init=.003, batch_size=256, tol=.00002,
                              early_stopping=True, n_iter_no_change=12)
        model.fit(np.stack(rows), answer)

    def pack(array):
        scale = float(np.max(np.abs(array))) / 32767 or 1
        packed = np.rint(array / scale).astype("<i2")
        return {"shape": list(array.shape), "scale": scale,
                "data": base64.b64encode(packed.tobytes()).decode("ascii")}

    checkpoint = {"version": "1.0", "features": features, "actions": [ACTIONS[i] for i in model.classes_],
                  "layers": [{"weights": pack(w), "bias": pack(b)}
                             for w, b in zip(model.coefs_, model.intercepts_)]}
    path = Path(__file__).with_name("weights.js")
    path.write_text("// Generated by genai/train.py. Signed 16-bit little-endian weights.\n"
                    + "export default " + json.dumps(checkpoint, separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    print(f"{len(rows)} training decisions; {len(features)} input features; "
          f"{sum(w.size + b.size for w,b in zip(model.coefs_, model.intercepts_))} parameters; "
          f"{path.stat().st_size} bytes.")


if __name__ == "__main__":
    train()
