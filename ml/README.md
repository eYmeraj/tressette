# Tressette ML bot (2-player)

A neural network learns to play from a search bot, then makes that search stronger, which in turn teaches the
next network ("expert iteration", the idea behind AlphaZero, adapted to hidden cards).

In the game: **Expert** (Uni Endi) is the network alone (instant); **Master** (Habibi Endi) is the search guided by
the network. Below and in the code they are `neural` and `expert`.

## Results

All 2-player, to 31, no accusi. Each seed is played twice with the bots swapping seats, and the margin is the
bot's points per hand minus its opponent's, with a 95% interval from those pairs (ml/gauntlet.py; every result
is in `results.jsonl`).

**Shipped** (`src/engine/ml/weights-2p.json`, a 512×3 network trained on expert-iteration generations 1–4):

| Bot | vs | Games | Wins | Margin (pts/hand) |
|---|---|---|---|---|
| Neural (network alone, instant) | Classic | 2000 | 99.9% ± 0.1% | +3.54 ± 0.04 |
| Neural | Stats Medium | 800 | 99.8% ± 0.3% | +3.42 ± 0.07 |
| Neural | Stats Hard | 400 | 86.2% ± 3.4% | +1.29 ± 0.11 |
| Expert (search: 40 samples, top 3) | Stats Hard | 400 | 89.2% ± 3.0% | +1.44 ± 0.10 |
| Expert | search with gen-04 (100 samples, top 3) | 300 | 48.7% ± 5.7% | −0.09 ± 0.14 |

**How it got there:**

| Step | Network | Result |
|---|---|---|
| Copy the Stats bot | v0, 256×2 | 96% vs Classic, 39% vs Stats Hard |
| Suit augmentation | v1, 256×2 | +0.64 pts/hand vs v0 |
| Expert iteration, generation 1 | gen-01, 256×2 | +0.81 vs v1 |
| generation 2 | gen-02 | +0.23 vs gen-01 |
| generation 3 | gen-03 | +0.06 vs gen-02 |
| generation 4 | gen-04 | +0.01 ± 0.03 vs gen-03 (plateau: loop paused) |
| Bigger network on all the loop's data | big-g1234, 512×3 | +0.27 vs gen-04 → shipped |

Search with the first network (30 samples, top 3) already beat Stats Hard 79% (+0.81); with the shipped network
the search adds little over the network alone (+1.44 vs +1.29 against Hard).

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

- **Bigger networks, early on**: with the first 190k positions, 512×3 was only slightly better than 256×2. With the
  loop's ~550k positions it pays off (+0.27 pts/hand), so the shipped network is 512×3. It is ~3× slower per
  play-out, so Expert imagines fewer deals in the same time.
- **More loop generations with the same settings**: gains shrank to nothing by generation 4.
- **Master with a fast play-out network**: the 512×3 network choosing the 3 cards and the small 256×2 network
  playing out 120 deals, against the shipped Master (512×3 for everything, 40 deals), at equal thinking time: 49.8%
  wins, −0.05 ± 0.11 pts/hand over 400 games. A tie, so Master stays as it is.
- **Derived per-suit inputs** (cards and points still out, who holds the top card, 20 numbers on top of the 258):
  +0.03 ± 0.02 pts/hand head to head with the same data and settings. The network already works them out; they
  stay in the encoder for future training, but the shipped network wasn't replaced for so little.
- **More epochs**: validation stops improving after ~10–20 epochs.

## Ideas for later

- A stronger teacher to restart the loop (more samples per move, or the 512×3 network playing out the deals),
  since the 256×2 search teacher has plateaued. `loop/state.json` is paused at generation 5 and resumes.
- Expert with more samples: at 40 the search barely improves on the network alone.
- A 4-player model (same pipeline with `--players 4`).

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
