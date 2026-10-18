# Tressette ML bot

A neural network that learns to play from the Stats bot, then (later) improves on it by self-play.

## Pipeline

1. **Encode** (`src/engine/ml/encode.ts`): one seat's `SeatView` becomes a fixed-length vector (258 numbers in
   2-player, 544 in 4-player): our hand, cards each seat has played, the table, cards known to be in other hands,
   shown voids, signals, scores. Seats are relative to ours, so one network plays from any seat. It is built only
   from the `SeatView`; `encode.test.ts` checks that two deals that look the same from a seat encode the same.

2. **Self-play data** (`scripts/selfplay.ts`): the Stats bot plays every seat and each decision is saved with its
   score for every legal card (Monte Carlo average, or exact in the 2-player endgame). Run several in parallel:

   ```sh
   for i in 1 2 3 4 5 6 7 8; do npm run -s selfplay -- --out ml/data/2p-hard-$i --hands 800 --seed $i & done; wait
   ```

3. **Train** (`ml/train.py`, PyTorch): an MLP predicts each card's score relative to the average legal card. Loss
   is mean squared error over legal cards only. Validation reports how often it picks the Stats bot's card and its
   *regret*, the score its picks give up on average (in thirds of a point).

   ```sh
   cd ml && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python numpy torch
   .venv/bin/python train.py --data 'data/2p-hard-*' --out ../src/engine/ml/weights-2p.json
   ```

4. **Play** (`src/engine/ml/mlp.ts`, `src/engine/bots/neural.ts`): the weights are base64 float32 in a JSON file and
   the forward pass is plain TypeScript, so no ML runtime ships to the browser. The export includes one test input
   with PyTorch's output, and the arena refuses weights whose TypeScript scores differ.

5. **Measure** (`npm run arena`):

   ```sh
   npm run arena -- --a neural:src/engine/ml/weights-2p.json --b stats-hard --games 400
   ```

## Next steps

- Use the network instead of the classic bot to play out the Monte Carlo samples (a stronger Stats bot).
- Expert iteration: that stronger search makes the next round of training data; retrain; repeat.
- A 4-player model (same pipeline with `--players 4`).
