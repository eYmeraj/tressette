#!/usr/bin/env bash
# Expert setups at equal thinking time (~225 ms a move on an M-series Mac): which network picks the cards to try,
# and which plays out the imagined deals.
cd "$(dirname "$0")/.."
A="search:ml/models/gen-04.json,samples=100,top=3"
B="search:ml/models/big-g1234.json,samples=100,top=3,rollout=ml/models/gen-04.json"
C="search:ml/models/big-g1234.json,samples=31,top=3"
.venv/bin/python gauntlet.py --a "$B" --vs "$A:300" --label "equal time: big prior vs small"
.venv/bin/python gauntlet.py --a "$C" --vs "$B:300" --label "equal time: big rollouts vs big prior small rollouts"
