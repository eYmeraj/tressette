import { GameState, Rng, Signal, callAccusi, playCard } from '../game';
import { SeatView } from '../view';

export interface BotMove {
  cardId: string;
  signal?: Signal;
  callAccusi: boolean;
}

export interface Bot {
  id: string;
  name: string;
  /** Shown on the setup screen. */
  label: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  description: string;
  /** The game sizes it can play; any if omitted. */
  players?: readonly (2 | 4)[];
  /** Picks a move from what this seat can see; `rng` is for bots that sample or explore. */
  chooseMove(view: SeatView, rng: Rng): BotMove;
}

/** Plays a chosen move for `seat`: call any accusi, then the card. */
export function applyMove(s: GameState, seat: number, move: BotMove): GameState {
  const called = move.callAccusi ? callAccusi(s, seat) : s;
  return playCard(called, seat, move.cardId, move.signal);
}
