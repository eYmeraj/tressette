import { Card } from '../cards';
import { GameState, Rng, collectAndDraw, teamOf } from '../game';
import { SeatView, accusiFor, legalPlays, seatView } from '../view';
import { classicMove, classicSignal } from './classic';
import { solveEndgame } from './endgame';
import { sampleDeal } from './sample';
import { BotMove, applyMove } from './types';

const LAST_TRICK_BONUS = 3; // thirds

export interface StatsOptions {
  /** How many possible deals of the hidden cards to try each move. */
  samples: number;
  /** Solve the 2-player endgame exactly once the stock is empty. */
  endgame: boolean;
}

/** Plays the rest of the hand with every seat using the classic bot. */
function playOutHand(s: GameState): GameState {
  while (s.phase === 'playing' || s.phase === 'trickComplete') {
    s = s.phase === 'trickComplete' ? collectAndDraw(s) : applyMove(s, s.turn, classicMove(seatView(s, s.turn)));
  }
  return s;
}

/** Card thirds (with the last-trick bonus) our team ends the hand with, minus theirs. */
function margin(s: GameState, team: number): number {
  const r = s.handResult!;
  const total = (t: number) => r.cardThirds[t] + (r.lastTrickTeam === t ? LAST_TRICK_BONUS : 0);
  return total(team) - total(1 - team);
}

/**
 * Monte Carlo player: for each of `samples` random deals of the hidden cards consistent with what it has seen,
 * it tries every legal card, plays the hand out with the classic bot, and picks the card with the best average
 * margin. Signals and accusi follow the classic bot's judgement.
 */
export function makeStatsBot({ samples, endgame }: StatsOptions) {
  return (v: SeatView, rng: Rng): BotMove => {
    const legal = legalPlays(v);
    if (!legal.length) throw new Error(`Seat ${v.seat} cannot play now`);
    const callAccusi = accusiFor(v).length > 0;
    const leading = v.trick.length === 0;

    let card: Card;
    if (legal.length === 1) card = legal[0];
    else if (endgame && v.config.players === 2 && v.stockSize === 0) card = solveEndgame(v);
    else {
      const team = teamOf(v.config, v.seat);
      const totals = new Array<number>(legal.length).fill(0);
      for (let i = 0; i < samples; i++) {
        const world = sampleDeal(v, rng);
        legal.forEach((c, k) => {
          const signal = leading ? classicSignal(v, c) : undefined;
          const after = applyMove(world, v.seat, { cardId: c.id, signal, callAccusi });
          totals[k] += margin(playOutHand(after), team);
        });
      }
      card = legal[totals.indexOf(Math.max(...totals))];
    }
    return { cardId: card.id, signal: leading ? classicSignal(v, card) : undefined, callAccusi };
  };
}
