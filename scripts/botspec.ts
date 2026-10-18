/**
 * Bots for the command-line tools, by name: any id in BOTS, or a trained network's weights file.
 *
 *   classic, stats-medium, stats-hard     bots from the registry
 *   neural:<weights.json>                 the network alone, one forward pass a move
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { BOTS, Bot, BotId } from '../src/engine/bots';
import { makeNeuralBot } from '../src/engine/bots/neural';
import { MlpWeights, checkMlp } from '../src/engine/ml/mlp';

/** Reads exported weights and checks our forward pass agrees with PyTorch's. */
export function loadWeights(path: string): MlpWeights {
  const weights: MlpWeights = JSON.parse(readFileSync(path, 'utf8'));
  const diff = checkMlp(weights);
  if (diff > 1e-3) throw new Error(`${path}: scores differ from PyTorch's by ${diff}`);
  return weights;
}

export function botFromSpec(spec: string): Bot {
  const [kind, rest] = spec.split(/:(.*)/s);
  if (kind === 'neural' && rest) return makeNeuralBot(loadWeights(rest), `neural:${basename(rest)}`);
  if (spec in BOTS) return BOTS[spec as BotId];
  throw new Error(`Unknown bot "${spec}". Available: ${Object.keys(BOTS).join(', ')}, neural:<weights.json>`);
}
