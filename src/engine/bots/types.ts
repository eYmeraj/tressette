import { GameState, Rng, Signal, callAccusi, playCard } from '../game';
import { SeatView } from '../view';

export interface BotMove {
  cardId: string;
  signal?: Signal;
  callAccusi: boolean;
}

/** Something that plays: the command-line tools use these directly (scripts/botspec.ts). */
export interface Player {
  id: string;
  /** Picks a move from what this seat can see; `rng` is for bots that sample or explore. */
  chooseMove(view: SeatView, rng: Rng): BotMove;
}

/** An opponent the player can choose (see BOTS). */
export interface Bot extends Player {
  /** The difficulty, shown on the setup screen. */
  label: string;
  /** Endi at the life stage this bot plays like: the opponent is called "<stage> Endi". */
  endisLifeStage: string;
  description: string;
  /** The game sizes it can play; any if omitted. */
  players?: readonly (2 | 4)[];
}

/** Plays a chosen move for `seat`: call any accusi, then the card. */
export function applyMove(s: GameState, seat: number, move: BotMove): GameState {
  const called = move.callAccusi ? callAccusi(s, seat) : s;
  return playCard(called, seat, move.cardId, move.signal);
}
