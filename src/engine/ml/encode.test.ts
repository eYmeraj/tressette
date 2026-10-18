import { describe, expect, it } from 'vitest';
import { GameState, collectAndDraw, dealNext, newGame } from '../game';
import { seededRng } from '../random';
import { seatView } from '../view';
import { BOTS, applyBotMove } from '../bots';
import { sampleDeal } from '../bots/sample';
import { SUITS, Suit, makeCard } from '../cards';
import { encode, featureCount, legalMask, suitPermutationMaps, suitPermutations } from './encode';

/** The same game with every suit s renamed to SUITS[perm[s]]: cards, signals, everything. */
function relabel<T>(value: T, perm: number[]): T {
  const suit = (s: Suit) => SUITS[perm[SUITS.indexOf(s)]];
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('rank' in o && 'suit' in o && 'id' in o) return makeCard(suit(o.suit as Suit), o.rank as never);
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, k === 'suit' ? suit(x as Suit) : walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

/** A game `moves` card plays into its first hand, played by the classic bot. */
function midHand(players: 2 | 4, seed: number, moves: number): GameState {
  const rng = seededRng(seed);
  let s = newGame({ players, targetScore: 31, accusi: true, signals: players === 4 }, rng);
  while (s.phase === 'dealing') s = dealNext(s);
  for (let i = 0; i < moves && s.phase !== 'handOver'; ) {
    if (s.phase === 'trickComplete') s = collectAndDraw(s);
    else {
      s = applyBotMove(s, BOTS.classic, rng);
      i++;
    }
  }
  return s;
}

describe('encode', () => {
  for (const players of [2, 4] as const) {
    it(`sees only what the seat may know (${players} players)`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const s = midHand(players, seed, seed % 15);
        const seat = s.turn;
        // Another deal of the hidden cards that this seat can't tell apart from the real one.
        const other = sampleDeal(seatView(s, seat), seededRng(seed + 100));
        expect(other.hands).not.toEqual(s.hands);
        expect(encode(seatView(other, seat))).toEqual(encode(seatView(s, seat)));
      }
    });

    it(`suit permutation maps match encoding a relabelled game (${players} players)`, () => {
      const perms = suitPermutations();
      expect(perms).toHaveLength(24);
      for (let seed = 1; seed <= 12; seed++) {
        const s = midHand(players, seed, 3 + seed);
        const v = seatView(s, s.turn);
        const x = encode(v);
        const mask = legalMask(v);
        const perm = perms[(seed * 7) % 24];
        const { features, actions } = suitPermutationMaps(players, perm);
        const w = seatView(relabel(s, perm), s.turn);
        expect(encode(w)).toEqual(Float32Array.from(features, (i) => x[i]));
        expect(legalMask(w)).toEqual(Uint8Array.from(actions, (i) => mask[i]));
      }
    });

    it(`has the advertised length and marks the legal cards (${players} players)`, () => {
      const s = midHand(players, 3, 5);
      const v = seatView(s, s.turn);
      expect(encode(v)).toHaveLength(featureCount(players));
      expect(legalMask(v).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    });
  }
});
