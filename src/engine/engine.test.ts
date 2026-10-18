import { describe, expect, it } from 'vitest';
import { makeCard, newDeck, thirds } from './cards';
import { findAccusi, legalCards, trickWinnerIndex } from './rules';
import {
  GameConfig, GameState, collectTrick, dealNext, deckCards, legalMoves, newGame, nextHand, visibleHand,
} from './game';
import { BOTS, applyBotMove } from './bots';
import { seatView } from './view';
import { seededRng } from './random';

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

describe('dealing', () => {
  it.each([2, 4] as const)('hands out cards round-robin from the deck with %i players', (players) => {
    let s = newGame({ players, targetScore: 31, accusi: false, signals: false }, seededRng(7));
    const total = players * 10;
    expect(deckCards(s)).toHaveLength(40);
    expect(legalMoves(s, s.turn)).toEqual([]);
    for (let k = 1; k <= total; k++) {
      const top = deckCards(s)[0];
      const seat = (s.dealer + k) % players;
      s = dealNext(s);
      expect(visibleHand(s, seat).at(-1)).toEqual(top);
      expect(deckCards(s)).toHaveLength(40 - k);
    }
    expect(s.phase).toBe('playing');
    for (let seat = 0; seat < players; seat++) expect(visibleHand(s, seat)).toHaveLength(10);
  });
});

function playOut(config: GameConfig, seed: number): GameState[] {
  const rng = seededRng(seed);
  let s = newGame(config, rng);
  const finished: GameState[] = [];
  for (let steps = 0; steps < 10_000; steps++) {
    if (s.phase === 'gameOver') return [...finished, s];
    if (s.phase === 'dealing') {
      s = dealNext(s);
    } else if (s.phase === 'handOver') {
      finished.push(s);
      s = nextHand(s, rng);
    } else if (s.phase === 'trickComplete') {
      s = collectTrick(s);
    } else {
      const before = s;
      s = applyBotMove(s, BOTS.classic, rng);
      expect(s.hands[before.turn]).toHaveLength(before.hands[before.turn].length - 1);
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

describe('bot signals', () => {
  it('takes the trick with its best card when the partner knocks, even over the partner', () => {
    const base = newGame({ players: 4, targetScore: 31, accusi: false, signals: true }, seededRng(3));
    const s: GameState = {
      ...base,
      phase: 'playing',
      dealt: 40,
      turn: 0,
      hands: [[makeCard('coppe', 3), makeCard('coppe', 5)], [], [], []],
      trick: [
        { seat: 2, card: makeCard('coppe', 2), signal: 'busso' },
        { seat: 3, card: makeCard('coppe', 4) },
      ],
    };
    expect(BOTS.classic.chooseMove(seatView(s, 0), Math.random).cardId).toBe('3-coppe');
  });
});

describe('seat view', () => {
  it("shows a seat its own hand and only the size of everyone else's", () => {
    let s = newGame({ players: 4, targetScore: 31, accusi: false, signals: true }, seededRng(5));
    while (s.phase === 'dealing') s = dealNext(s);
    const v = seatView(s, 1);
    expect(v.hand).toEqual(s.hands[1]);
    expect(v.handSizes).toEqual([10, 10, 10, 10]);
    expect(JSON.stringify(v)).not.toContain(s.hands[0][0].id);
  });
});
