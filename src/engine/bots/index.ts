import { GameConfig, GameState, Rng, Signal, callAccusi, playCard } from '../game';
import { SeatView, seatView } from '../view';
import { classicMove } from './classic';

export interface BotMove {
  cardId: string;
  signal?: Signal;
  callAccusi: boolean;
}

export type BotId = 'classic';

export interface Bot {
  id: BotId;
  /** Shown on the setup screen. */
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  /** Picks a move from what this seat can see; `rng` is for bots that sample or explore. */
  chooseMove(view: SeatView, rng: Rng): BotMove;
}

/** Every opponent the player can choose, in the order the setup screen lists them. */
export const BOTS: Record<BotId, Bot> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    difficulty: 'Easy',
    description: 'Plays by simple rules of thumb.',
    chooseMove: classicMove,
  },
};

export const DEFAULT_BOT: BotId = 'classic';

/** The bot a game uses; games saved before bots were selectable get the default. */
export function botFor(config: GameConfig): Bot {
  return BOTS[config.bot ?? DEFAULT_BOT] ?? BOTS[DEFAULT_BOT];
}

/** Lets `bot` take the current seat's turn: call any accusi it wants, then play its card. */
export function applyBotMove(s: GameState, bot: Bot, rng: Rng = Math.random): GameState {
  const seat = s.turn;
  const move = bot.chooseMove(seatView(s, seat), rng);
  const called = move.callAccusi ? callAccusi(s, seat) : s;
  return playCard(called, seat, move.cardId, move.signal);
}
