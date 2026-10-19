import { GameConfig, GameState, Rng } from '../game';
import { seatView } from '../view';
import { classicMove } from './classic';
import { makeStatsBot } from './stats';
import { makeNetSearchBot, makeNeuralBot } from './neural';
import { MlpWeights } from '../ml/mlp';
import weights2p from '../ml/weights-2p.json';
import { Bot, applyMove } from './types';

export type { Bot, BotMove } from './types';
export { applyMove } from './types';

/** Every opponent the player can choose, in the order the setup screen lists them. */
export const BOTS = {
  classic: {
    id: 'classic',
    name: 'Classic',
    label: 'Easy',
    difficulty: 'Easy',
    description: 'Plays by simple rules of thumb.',
    chooseMove: classicMove,
  },
  'stats-medium': {
    id: 'stats-medium',
    name: 'Stats',
    label: 'Medium',
    difficulty: 'Medium',
    description: 'Imagines a few dozen ways the hidden cards could lie and plays what works best.',
    chooseMove: makeStatsBot({ samples: 24, endgame: false }),
  },
  'stats-hard': {
    id: 'stats-hard',
    name: 'Stats',
    label: 'Hard',
    difficulty: 'Hard',
    description: 'Weighs hundreds of possible deals, and plays the 2-player endgame perfectly.',
    chooseMove: makeStatsBot({ samples: 120, endgame: true }),
  },
  // Trained by self-play (see ml/README.md); 2-player only.
  neural: makeNeuralBot(weights2p as MlpWeights, 'neural'),
  // At most ~0.8 s a move on slow devices; a desktop finishes all 100 samples well within it.
  expert: makeNetSearchBot(weights2p as MlpWeights, { samples: 100, top: 3, budget: { ms: 800, minSamples: 16 } }, 'expert'),
} satisfies Record<string, Bot>;

export type BotId = keyof typeof BOTS;

export const DEFAULT_BOT: BotId = 'classic';

/** Whether `bot` can play a game of `players`. */
export function botPlays(bot: Bot, players: 2 | 4): boolean {
  return !bot.players || bot.players.includes(players);
}

/** The bot a game uses; games saved before bots were selectable (or with a retired bot, or one that can't play
 * this many players) get the default. */
export function botIdFor(config: GameConfig): BotId {
  return config.bot && config.bot in BOTS && botPlays(BOTS[config.bot], config.players) ? config.bot : DEFAULT_BOT;
}

export function botFor(config: GameConfig): Bot {
  return BOTS[botIdFor(config)];
}

/** Lets `bot` take the current seat's turn. */
export function applyBotMove(s: GameState, bot: Bot, rng: Rng = Math.random): GameState {
  return applyMove(s, s.turn, bot.chooseMove(seatView(s, s.turn), rng));
}
