import { Card, DECK, cardIndex } from './cards';
import { findAccusi, legalCards } from './rules';
import { Accuso } from './rules';
// Types only: game.ts uses this file's rules, so a value import would be circular.
import type { AccusiCall, CompletedTrick, GameConfig, GameEvent, GameState, Phase, Play } from './game';

/**
 * Everything one seat is allowed to know: its own hand, how many cards the others hold, and what is public
 * (the table, played tricks, calls, signals, and in the 2-player game the cards drawn face up). Bots only
 * ever get this, never the full GameState, so they can't peek at hidden cards.
 */
export interface SeatView {
  config: GameConfig;
  seat: number;
  phase: Phase;
  turn: number;
  handNumber: number;
  dealer: number;
  hand: Card[];
  handSizes: number[];
  stockSize: number;
  trick: Play[];
  tricks: CompletedTrick[];
  accusiCalls: AccusiCall[];
  hasPlayed: boolean[];
  scores: [number, number];
  events: GameEvent[];
}

export function seatView(s: GameState, seat: number): SeatView {
  return {
    config: s.config,
    seat,
    phase: s.phase,
    turn: s.turn,
    handNumber: s.handNumber,
    dealer: s.dealer,
    hand: s.hands[seat],
    handSizes: s.hands.map((h) => h.length),
    stockSize: s.stock.length,
    trick: s.trick,
    tricks: s.tricks,
    accusiCalls: s.accusiCalls,
    hasPlayed: s.hasPlayed,
    scores: s.scores,
    events: s.events,
  };
}

/** Cards nobody has played yet and this seat doesn't hold: in other hands or the stock. */
export function unseenCards(v: SeatView): Card[] {
  // Flags by cardIndex rather than a Set of ids: bots call this on every simulated move.
  const seen = new Uint8Array(DECK.length);
  for (const c of v.hand) seen[cardIndex(c)] = 1;
  for (const t of v.tricks) for (const p of t.plays) seen[cardIndex(p.card)] = 1;
  for (const p of v.trick) seen[cardIndex(p.card)] = 1;
  return DECK.filter((_, i) => !seen[i]);
}

/** The cards this seat may play now. */
export function legalPlays(v: SeatView): Card[] {
  if (v.phase !== 'playing' || v.turn !== v.seat) return [];
  return legalCards(v.hand, v.trick[0]?.card.suit ?? null);
}

/** Accusi this seat could call now (before its first card of the hand). */
export function accusiFor(v: SeatView): Accuso[] {
  if (!v.config.accusi || v.phase !== 'playing' || v.hasPlayed[v.seat]) return [];
  if (v.accusiCalls.some((d) => d.seat === v.seat)) return [];
  return findAccusi(v.hand);
}
