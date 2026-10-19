#!/usr/bin/env bash
# Final measurements of the shipped bots (src/engine/ml/weights-2p.json), reproducible (no time limit).
cd "$(dirname "$0")/.."
W=src/engine/ml/weights-2p.json
.venv/bin/python gauntlet.py --a "neural:$W" --vs classic:2000 --vs stats-medium:800 --vs stats-hard:400 --label "final neural"
.venv/bin/python gauntlet.py --a "search:$W,samples=40,top=3" --vs stats-hard:400 --vs "search:ml/models/gen-04.json,samples=100,top=3:300" --label "final expert"
