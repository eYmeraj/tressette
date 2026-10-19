import { Card, cardIndex, thirds } from '../cards';
import { GameState, Rng, collectAndDraw, teamOf } from '../game';
import { SeatView, accusiFor, legalPlays, seatView } from '../view';
import { classicMove, classicSignal } from './classic';
import { endgameScores } from './endgame';
import { sampleDeal } from './sample';
import { BotMove, applyMove } from './types';

const LAST_TRICK_BONUS = 3; // thirds

export interface StatsOptions {
  /** How many possible deals of the hidden cards to try each move. */
  samples: number;
  /** Solve the 2-player endgame exactly once the stock is empty. */
  endgame: boolean;
  /** How every seat plays out the imagined deals; the classic bot unless given (e.g. a trained network). */
  rollout?: (v: SeatView) => BotMove;
  /**
   * Only search the `top` cards `prior` rates best (scores by DECK index, e.g. a network's), so the samples are
   * spent on the plausible ones.
   */
  prune?: { top: number; prior: (v: SeatView) => Float32Array };
  /**
   * Stop sampling once this many milliseconds have passed (after at least `minSamples`), so slow devices still get
   * a move in time. Makes the bot depend on the clock: the tools leave it unset to stay reproducible.
   */
  budget?: { ms: number; minSamples: number };
}

/** Plays the rest of the hand with every seat using `rollout`. */
function playOutHand(s: GameState, rollout: (v: SeatView) => BotMove): GameState {
  while (s.phase === 'playing' || s.phase === 'trickComplete') {
    s = s.phase === 'trickComplete' ? collectAndDraw(s) : applyMove(s, s.turn, rollout(seatView(s, s.turn)));
  }
  return s;
}

/** Card thirds (with the last-trick bonus) our team ends the hand with, minus theirs. */
function margin(s: GameState, team: number): number {
  const r = s.handResult!;
  const total = (t: number) => r.cardThirds[t] + (r.lastTrickTeam === t ? LAST_TRICK_BONUS : 0);
  return total(team) - total(1 - team);
}

/** Card thirds our team has already taken this hand, minus theirs. */
function takenMargin(v: SeatView, team: number): number {
  let m = 0;
  for (const t of v.tricks) {
    const pts = t.plays.reduce((sum, p) => sum + thirds(p.card), 0);
    m += teamOf(v.config, t.winner) === team ? pts : -pts;
  }
  return m;
}

/**
 * How good each legal card is (or each of the `prune.top` most promising), as the thirds (with the last-trick bonus) our team should end the hand with
 * minus theirs. Averaged over `samples` random deals of the hidden cards consistent with what this seat has seen,
 * each played out by the classic bot, or exact once the 2-player stock is empty (with `endgame`).
 */
export function statsScores(
  v: SeatView,
  rng: Rng,
  { samples, endgame, rollout = classicMove, prune, budget }: StatsOptions,
): { card: Card; score: number }[] {
  let legal = legalPlays(v);
  if (!legal.length) throw new Error(`Seat ${v.seat} cannot play now`);
  const team = teamOf(v.config, v.seat);
  if (endgame && v.config.players === 2 && v.stockSize === 0) {
    const taken = takenMargin(v, team);
    return endgameScores(v).map(({ card, score }) => ({ card, score: taken + score }));
  }
  if (prune && legal.length > prune.top) {
    const prior = prune.prior(v);
    legal = [...legal].sort((a, b) => prior[cardIndex(b)] - prior[cardIndex(a)]).slice(0, prune.top);
  }
  const callAccusi = accusiFor(v).length > 0;
  const leading = v.trick.length === 0;
  const totals = new Array<number>(legal.length).fill(0);
  const deadline = budget ? Date.now() + budget.ms : Infinity;
  let done = 0;
  for (let i = 0; i < samples; i++, done++) {
    if (budget && i >= budget.minSamples && Date.now() > deadline) break;
    const world = sampleDeal(v, rng);
    legal.forEach((c, k) => {
      const signal = leading ? classicSignal(v, c) : undefined;
      const after = applyMove(world, v.seat, { cardId: c.id, signal, callAccusi });
      totals[k] += margin(playOutHand(after, rollout), team);
    });
  }
  return legal.map((card, k) => ({ card, score: totals[k] / done }));
}

/** Plays `card` with the classic bot's signal and accusi judgement. */
export function moveWith(v: SeatView, card: Card): BotMove {
  return {
    cardId: card.id,
    signal: v.trick.length === 0 ? classicSignal(v, card) : undefined,
    callAccusi: accusiFor(v).length > 0,
  };
}

/** Monte Carlo player: plays the legal card with the best score from `statsScores`. */
export function makeStatsBot(options: StatsOptions) {
  return (v: SeatView, rng: Rng): BotMove => {
    const legal = legalPlays(v);
    if (legal.length === 1) return moveWith(v, legal[0]);
    const scored = statsScores(v, rng, options);
    return moveWith(v, scored.reduce((best, x) => (x.score > best.score ? x : best)).card);
  };
}
