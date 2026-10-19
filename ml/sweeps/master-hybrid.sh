#!/usr/bin/env bash
# Master at equal thinking time (~0.28 s a move here): the shipped network doing everything (40 deals), vs the
# shipped network choosing the 3 cards and the small, ~3x faster gen-04 network playing out 120 deals.
cd "$(dirname "$0")/.."
W=src/engine/ml/weights-2p.json
.venv/bin/python gauntlet.py --a "search:$W,samples=120,top=3,rollout=ml/models/gen-04.json" --vs "search:$W,samples=40,top=3:400" --label "master hybrid: small rollouts x120 vs big x40"
