import { cardIndex } from '../cards';
import { encode } from '../ml/encode';
import { MlpWeights, makeMlp } from '../ml/mlp';
import { legalPlays } from '../view';
import { moveWith } from './stats';
import { Bot } from './types';

/**
 * Plays the legal card a trained network scores highest (see ml/train.py): no search, one forward pass a move.
 * Signals and accusi follow the classic bot's judgement.
 */
export function makeNeuralBot(weights: MlpWeights, id = 'neural'): Bot {
  const net = makeMlp(weights);
  return {
    id,
    name: 'Neural',
    difficulty: 'Hard',
    description: 'A network trained on the Stats bot’s games: plays on instinct, instantly.',
    chooseMove(v) {
      if (v.config.players !== weights.players) throw new Error(`${id} was trained for ${weights.players} players`);
      const legal = legalPlays(v);
      if (!legal.length) throw new Error(`Seat ${v.seat} cannot play now`);
      const scores = net(encode(v));
      return moveWith(v, legal.reduce((best, c) => (scores[cardIndex(c)] > scores[cardIndex(best)] ? c : best)));
    },
  };
}
