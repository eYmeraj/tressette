import { Card, DECK } from './cards';
import { GameConfig, GameState, Signal, callAccusi, collectAndDraw, dealFrom, dealNext, playCard } from './game';

/**
 * One finished hand, enough to replay it exactly: the deck as it was dealt, then every card played in order.
 * Players share these (if they opt in) to help train the bots; see worker/ and scripts/human-hands.ts.
 */
export interface HandRecord {
  v: 1;
  config: GameConfig;
  dealer: number;
  handNumber: number;
  /** Game score before this hand. */
  scores: [number, number];
  /** Card ids in dealing order: seat i's hand is deck[10i..10i+9], the rest is the stock, top first. */
  deck: string[];
  /** Every card played, in order. */
  plays: { seat: number; card: string; signal?: Signal }[];
  /** Seats that called their accusi (each does so just before its first card). */
  accusi: number[];
}

/** The record of a finished hand: `start` is the hand as dealt, `end` the same hand once over. */
export function recordHand(start: GameState, end: GameState): HandRecord {
  if (end.phase !== 'handOver' && end.phase !== 'gameOver') throw new Error('The hand is not over');
  return {
    v: 1,
    config: start.config,
    dealer: start.dealer,
    handNumber: start.handNumber,
    scores: start.scores,
    deck: [...start.hands.flat(), ...start.stock].map((c) => c.id),
    plays: end.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card.id, ...(p.signal ? { signal: p.signal } : {}) }))),
    accusi: end.accusiCalls.map((a) => a.seat),
  };
}

const BY_ID = new Map(DECK.map((c) => [c.id, c]));

/**
 * Plays a recorded hand through the engine and returns the finished state, or throws if anything in it is
 * impossible (a deck that isn't the 40 cards, an illegal card, an accuso the seat doesn't have, an unfinished hand).
 * Records come from browsers, so this is what decides whether one can be trusted.
 */
export function replayHand(r: HandRecord): GameState {
  if (r.v !== 1) throw new Error(`Unknown record version ${r.v}`);
  const n = r.config.players;
  if (n !== 2 && n !== 4) throw new Error('Players must be 2 or 4');
  if (!Number.isInteger(r.dealer) || r.dealer < 0 || r.dealer >= n) throw new Error('Bad dealer');
  if (r.deck.length !== DECK.length || new Set(r.deck).size !== DECK.length) throw new Error('The deck must be the 40 cards');
  const deck: Card[] = r.deck.map((id) => {
    const c = BY_ID.get(id);
    if (!c) throw new Error(`Unknown card ${id}`);
    return c;
  });

  let s = dealFrom(r.config, r.dealer, r.handNumber, r.scores, deck);
  while (s.phase === 'dealing') s = dealNext(s);
  const toCall = new Set(r.accusi);
  for (const p of r.plays) {
    if (s.phase !== 'playing') throw new Error('Cards played after the hand ended');
    if (toCall.delete(p.seat)) s = callAccusi(s, p.seat);
    s = playCard(s, p.seat, p.card, p.signal);
    if (s.phase === 'trickComplete') s = collectAndDraw(s);
  }
  if (toCall.size) throw new Error('An accuso was called by a seat that never played');
  if (s.phase !== 'handOver' && s.phase !== 'gameOver') throw new Error('The hand is not finished');
  if (r.plays.length !== DECK.length) throw new Error(`Expected ${DECK.length} plays`);
  return s;
}
