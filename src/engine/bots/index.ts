import { GameConfig, GameState, Rng } from '../game';
import { seatView } from '../view';
import { classicMove } from './classic';
import { makeStatsBot } from './stats';
import { Bot, applyMove } from './types';

export type { Bot, BotMove } from './types';
export { applyMove } from './types';

/** Every opponent the player can choose, in the order the setup screen lists them. */
export const BOTS = {
  classic: {
    id: 'classic',
    name: 'Classic',
    difficulty: 'Easy',
    description: 'Plays by simple rules of thumb.',
    chooseMove: classicMove,
  },
  'stats-medium': {
    id: 'stats-medium',
    name: 'Stats',
    difficulty: 'Medium',
    description: 'Imagines a few dozen ways the hidden cards could lie and plays what works best.',
    chooseMove: makeStatsBot({ samples: 24, endgame: false }),
  },
  'stats-hard': {
    id: 'stats-hard',
    name: 'Stats',
    difficulty: 'Hard',
    description: 'Weighs hundreds of possible deals, and plays the 2-player endgame perfectly.',
    chooseMove: makeStatsBot({ samples: 120, endgame: true }),
  },
} satisfies Record<string, Bot>;

export type BotId = keyof typeof BOTS;

export const DEFAULT_BOT: BotId = 'classic';

/** The bot a game uses; games saved before bots were selectable (or with a retired bot) get the default. */
export function botIdFor(config: GameConfig): BotId {
  return config.bot && config.bot in BOTS ? config.bot : DEFAULT_BOT;
}

export function botFor(config: GameConfig): Bot {
  return BOTS[botIdFor(config)];
}

/** Lets `bot` take the current seat's turn. */
export function applyBotMove(s: GameState, bot: Bot, rng: Rng = Math.random): GameState {
  return applyMove(s, s.turn, bot.chooseMove(seatView(s, s.turn), rng));
}
