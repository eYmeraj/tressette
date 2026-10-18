import { describe, expect, it } from 'vitest';
import { GameState, collectAndDraw, dealNext, newGame } from '../game';
import { seededRng } from '../random';
import { seatView } from '../view';
import { BOTS, applyBotMove } from '../bots';
import { sampleDeal } from '../bots/sample';
import { encode, featureCount, legalMask } from './encode';

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

    it(`has the advertised length and marks the legal cards (${players} players)`, () => {
      const s = midHand(players, 3, 5);
      const v = seatView(s, s.turn);
      expect(encode(v)).toHaveLength(featureCount(players));
      expect(legalMask(v).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    });
  }
});
