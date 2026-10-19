/**
 * Bots for the command-line tools, by name: any id in BOTS, or a trained network's weights file.
 *
 *   classic, stats-medium, stats-hard     bots from the registry
 *   neural:<weights.json>                 the network alone, one forward pass a move
 *   search:<weights.json>[,samples=120][,top=K][,rollout=classic|<weights.json>]
 *                                         the Stats search guided by the network (makeNetSearchBot)
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { BOTS, Bot, BotId } from '../src/engine/bots';
import { makeNetPolicy, makeNetSearchBot, makeNeuralBot } from '../src/engine/bots/neural';
import { classicMove } from '../src/engine/bots/classic';
import { MlpWeights, checkMlp } from '../src/engine/ml/mlp';
import { statsScores } from '../src/engine/bots/stats';
import { Card } from '../src/engine/cards';
import { Rng } from '../src/engine/game';
import { SeatView } from '../src/engine/view';

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
  if (kind === 'search' && rest) {
    const [file, ...opts] = rest.split(',');
    const o = Object.fromEntries(opts.map((kv) => kv.split('=')));
    const rollout = o.rollout === undefined ? undefined : o.rollout === 'classic' ? classicMove : makeNetPolicy(loadWeights(o.rollout));
    const samples = Number(o.samples ?? 120);
    const top = o.top ? Number(o.top) : undefined;
    const label = [`search:${basename(file)}`, ...opts.map((kv) => kv.replace(/=.*\//, '='))].join(',');
    return makeNetSearchBot(loadWeights(file), { samples, top, rollout }, label);
  }
  if (spec in BOTS) return BOTS[spec as BotId];
  throw new Error(`Unknown bot "${spec}". Available: ${Object.keys(BOTS).join(', ')}, neural:<weights.json>`);
}

/** Scores every legal card of a position, as a teacher for self-play data. */
export type Scorer = (v: SeatView, rng: Rng) => { card: Card; score: number }[];

/**
 * Teachers for scripts/selfplay.ts. Every legal card is searched (no pruning), so each gets a score to learn.
 *
 *   stats[,samples=120]                        the Stats bot's search (classic play-outs)
 *   search:<weights.json>[,samples=120][,rollout=classic|<weights.json>]
 *                                              the same search with the network playing out the deals
 */
export function scorerFromSpec(spec: string): Scorer {
  const [head, ...opts] = spec.split(',');
  const o = Object.fromEntries(opts.map((kv) => kv.split('=')));
  const samples = Number(o.samples ?? 120);
  if (head === 'stats') return (v, rng) => statsScores(v, rng, { samples, endgame: true });
  if (head.startsWith('search:')) {
    const policy = makeNetPolicy(loadWeights(head.slice('search:'.length)));
    const rollout = o.rollout === undefined ? policy.move : o.rollout === 'classic' ? classicMove : makeNetPolicy(loadWeights(o.rollout)).move;
    return (v, rng) => statsScores(v, rng, { samples, endgame: true, rollout });
  }
  throw new Error(`Unknown teacher "${spec}": use stats[,samples=N] or search:<weights.json>[,samples=N][,rollout=...]`);
}
