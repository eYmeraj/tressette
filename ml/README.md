# Tressette ML bot (2-player)

A neural network learns to play from a search bot, then makes that search stronger, which in turn teaches the
next network ("expert iteration", the idea behind AlphaZero, adapted to hidden cards).

In the game: **Neural** is the network alone (instant); **Expert** is the search guided by the network.

## Results

All 2-player, to 31, no accusi. Each seed is played twice with the bots swapping seats, and the margin is the
bot's points per hand minus its opponent's, with a 95% interval from those pairs (ml/gauntlet.py; every result
is in `results.jsonl`).

| Bot | vs | Games | Wins | Margin (pts/hand) |
|---|---|---|---|---|
| v0 network (no augmentation) | Classic | 2000 | 96.3% ± 0.8% | +2.26 ± 0.05 |
| v0 network | Stats Medium | 400 | 89.0% ± 3.1% | +1.63 ± 0.12 |
| v0 network | Stats Hard | 200 | 39.0% ± 6.8% | −0.34 |
| v1 network (suit augmentation) | Classic | 2000 | 99.7% ± 0.3% | +3.52 ± 0.04 |
| v1 network | v0 network | 4000 | 69.8% ± 1.4% | +0.64 ± 0.04 |
| Search with v0 network (30 samples, top 3) | Stats Hard | 200 | 79.0% ± 5.6% | +0.81 ± 0.14 |

Expert-iteration generations are in `loop/state.json` (history) and `results.jsonl` (label "loop gen N gate").

## What made a difference

- **Suit augmentation** (biggest single win). The rules treat every suit alike, so each training position is shown
  with its suits randomly relabelled: 24 versions of every position. Validation regret 0.76 → 0.60 thirds/move at
  the same network size, and the network stopped memorising (train/validation error 1.9/4.1 → 2.4/2.5).
- **Learning per-card scores relative to the average legal card** instead of absolute ones: the absolute part is
  "how good is this hand", which is noise for choosing a card.
- **Network-guided search.** The Stats bot imagines deals of the hidden cards and plays each one out; playing them
  out with the network instead of the classic rules bot makes its estimates much better. With the first network
  it already beats Stats Hard 79%.
- **A sparse forward pass**: a position sets ~13 of 258 inputs and ReLU zeroes about half of each hidden layer, so
  adding only the columns of non-zero inputs is 4.6× faster. That is what makes network play-outs affordable.

## What didn't (much)

- **Bigger networks**: 512×3 is only slightly better than 256×2 (+0.71 vs +0.64 pts/hand against v0) and several
  times slower per move, which the search pays thousands of times a decision. 256×2 stays.
- **More epochs**: validation stops improving after ~10–20 epochs.

## Pipeline

1. **Encode** (`src/engine/ml/encode.ts`): a seat's `SeatView` becomes 258 numbers (hand, cards each seat has
   played, the table, cards known to be in the other hand, shown voids, trick state, scores). Described as a block
   layout, from which the 24 suit relabellings are derived (`npm run export-perms`). Built only from the `SeatView`;
   tests check it can't see hidden cards and that the relabelling maps match relabelled games.

2. **Self-play** (`scripts/selfplay.ts`): a teacher plays every seat and scores every legal card; each decision is
   saved with those scores. `--teacher stats,samples=120` (the Stats search) or `search:<weights>,samples=40` (the
   network-guided search). Resumable: rerun the same command after an interruption.

3. **Train** (`train.py`): MLP, mean squared error on legal cards only, suits relabelled at random every time a
   position is used. Reports agreement with the teacher's card and *regret* (score its picks give up, in thirds).
   Checkpoints every epoch and resumes; exports base64 float32 weights plus a test vector.

4. **Play** (`src/engine/ml/mlp.ts`, `src/engine/bots/neural.ts`): plain TypeScript forward pass, no ML runtime in
   the browser; the tools refuse weights whose scores differ from PyTorch's.

5. **Measure** (`gauntlet.py`): parallel arena matches with paired seeds.

6. **Improve** (`loop.py`): generate with `search:<best>` → train a new network on the latest generations → gate
   head to head against the best → promote if it scores more. State on disk; resumable at every stage.

## Commands

From the project root unless noted. Setup once: `cd ml && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python numpy torch`.

```sh
# Data from the Stats bot, one process per core (resumable)
for i in 1 2 3 4 5 6 7 8; do npm run -s selfplay -- --out ml/data/2p-hard-$i --hands 800 --seed $i & done; wait

# Train (from ml/; resumable)
.venv/bin/python train.py --data 'data/2p-hard-*' --out models/mine.json

# Compare (from ml/)
.venv/bin/python gauntlet.py --a neural:ml/models/mine.json --vs neural:src/engine/ml/weights-2p.json:4000 --vs classic:2000
.venv/bin/python gauntlet.py --a "search:ml/models/mine.json,samples=30,top=3" --vs stats-hard:200

# Expert iteration, detached so it survives the terminal closing (stop: kill -- -$(cat ml/logs/loop.pid))
ml/.venv/bin/python ml/detach.py ml/logs/loop.log -- caffeinate -i ml/.venv/bin/python ml/loop.py --start ml/models/v1.json --generations 6 --hands 500 --samples 40
tail -f ml/logs/loop.log
```

Bot names for the tools are in `scripts/botspec.ts`. Note that the game's `expert` bot stops thinking after 0.8 s,
so it depends on the machine's speed; for reproducible comparisons use `search:<weights>,samples=N,top=K`.
