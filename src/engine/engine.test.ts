import { describe, expect, it } from 'vitest';
import { makeCard, newDeck, thirds } from './cards';
import { findAccusi, legalCards, trickWinnerIndex } from './rules';
import { GameConfig, GameState, collectTrick, declare, legalMoves, newGame, nextHand, playCard } from './game';
import { chooseMove } from './bot';

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('cards', () => {
  it('has 40 unique cards worth 32 thirds', () => {
    const deck = newDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(40);
    expect(deck.reduce((s, c) => s + thirds(c), 0)).toBe(32);
  });
});

describe('rules', () => {
  it('ranks 3 > 2 > Asso > Re within the led suit, ignoring other suits', () => {
    expect(trickWinnerIndex([makeCard('coppe', 1), makeCard('coppe', 3), makeCard('coppe', 2)])).toBe(1);
    expect(trickWinnerIndex([makeCard('coppe', 4), makeCard('spade', 3), makeCard('coppe', 10)])).toBe(2);
    expect(trickWinnerIndex([makeCard('denari', 1), makeCard('denari', 10)])).toBe(0);
  });

  it('forces following suit only when possible', () => {
    const hand = [makeCard('coppe', 4), makeCard('spade', 3)];
    expect(legalCards(hand, 'coppe').map((c) => c.id)).toEqual(['4-coppe']);
    expect(legalCards(hand, 'denari')).toHaveLength(2);
  });

  it('finds napoletana, tris and poker', () => {
    const hand = [
      makeCard('coppe', 1), makeCard('coppe', 2), makeCard('coppe', 3),
      makeCard('spade', 3), makeCard('denari', 3), makeCard('bastoni', 3),
      makeCard('spade', 1), makeCard('denari', 1),
    ];
    const found = findAccusi(hand).map((a) => [a.label, a.points]);
    expect(found).toEqual([
      ['Napoletana di Coppe', 3],
      ['Tris di Assi', 3],
      ['Poker di Tre', 4],
    ]);
  });
});

function playOut(config: GameConfig, seed: number): GameState[] {
  const rng = mulberry32(seed);
  let s = newGame(config, rng);
  const finished: GameState[] = [];
  for (let steps = 0; steps < 10_000; steps++) {
    if (s.phase === 'gameOver') return [...finished, s];
    if (s.phase === 'handOver') {
      finished.push(s);
      s = nextHand(s, rng);
    } else if (s.phase === 'trickComplete') {
      s = collectTrick(s);
    } else {
      const move = chooseMove(s, s.turn);
      expect(legalMoves(s, s.turn).some((c) => c.id === move.cardId)).toBe(true);
      if (move.declare) s = declare(s, s.turn);
      s = playCard(s, s.turn, move.cardId, move.signal);
    }
  }
  throw new Error('Game did not finish');
}

describe.each([
  { players: 2 as const, signals: false },
  { players: 4 as const, signals: true },
])('full games with $players players', ({ players, signals }) => {
  it('always scores 11 points of card play per hand and reaches the target', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const hands = playOut({ players, targetScore: 31, accusi: true, signals }, seed);
      for (const h of hands) {
        const r = h.handResult!;
        const accusi = r.accusiPoints[0] + r.accusiPoints[1];
        expect(r.points[0] + r.points[1] - accusi).toBe(11);
        expect(h.tricks).toHaveLength(players === 2 ? 20 : 10);
      }
      const last = hands[hands.length - 1];
      expect(last.phase).toBe('gameOver');
      expect(Math.max(...last.scores)).toBeGreaterThanOrEqual(31);
    }
  });
});
