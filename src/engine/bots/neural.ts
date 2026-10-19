import { Card, cardIndex } from '../cards';
import { encode } from '../ml/encode';
import { MlpWeights, makeMlp } from '../ml/mlp';
import { SeatView, legalPlays } from '../view';
import { makeStatsBot, moveWith } from './stats';
import { Bot, BotMove } from './types';

export interface NetPolicy {
  /** The network's score for every card, by DECK index (only the legal ones mean anything). */
  scores(v: SeatView): Float32Array;
  /** The legal card it scores highest, with the classic bot's signal and accusi judgement. */
  move(v: SeatView): BotMove;
}

export function makeNetPolicy(weights: MlpWeights): NetPolicy {
  const net = makeMlp(weights);
  const scores = (v: SeatView) => {
    if (v.config.players !== weights.players) throw new Error(`Network trained for ${weights.players} players`);
    return net(encode(v));
  };
  return {
    scores,
    move(v) {
      const legal = legalPlays(v);
      if (!legal.length) throw new Error(`Seat ${v.seat} cannot play now`);
      if (legal.length === 1) return moveWith(v, legal[0]);
      const s = scores(v);
      return moveWith(v, legal.reduce((best: Card, c) => (s[cardIndex(c)] > s[cardIndex(best)] ? c : best)));
    },
  };
}

/** Plays the legal card a trained network scores highest (see ml/train.py): no search, one forward pass a move. */
export function makeNeuralBot(weights: MlpWeights, id = 'neural'): Bot {
  const policy = makeNetPolicy(weights);
  return {
    id,
    name: 'Neural',
    label: 'Expert',
    endis_life_stage: 'Uni',
    difficulty: 'Expert',
    players: [weights.players],
    description: 'Learned by playing itself for thousands of hands: plays on instinct, instantly. 2 players only.',
    chooseMove: (v) => policy.move(v),
  };
}

export interface NetSearchOptions {
  /** Imagined deals of the hidden cards per move. */
  samples: number;
  /** Only search this many of the cards the network rates best (all of them if omitted). */
  top?: number;
  /** Plays out the imagined deals; the same network if omitted. */
  rollout?: NetPolicy | ((v: SeatView) => BotMove);
  /** Time limit per move (see StatsOptions.budget). */
  budget?: { ms: number; minSamples: number };
}

/**
 * The Stats bot's search with the network's judgement: the network picks which cards are worth trying and plays
 * out the imagined deals, which it does far better than the classic bot. Exact in the 2-player endgame.
 */
export function makeNetSearchBot(weights: MlpWeights, { samples, top, rollout, budget }: NetSearchOptions, id = 'net-search'): Bot {
  const policy = makeNetPolicy(weights);
  const play = rollout === undefined ? policy.move : typeof rollout === 'function' ? rollout : rollout.move;
  return {
    id,
    name: 'Expert',
    label: 'Master',
    endis_life_stage: 'Habibi',
    difficulty: 'Master',
    players: [weights.players],
    description: 'Plays on instinct too, then imagines how the hidden cards could lie and checks its choice. 2 players only.',
    chooseMove: makeStatsBot({
      samples,
      endgame: true,
      rollout: play,
      prune: top ? { top, prior: policy.scores } : undefined,
      budget,
    }),
  };
}
