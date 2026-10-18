import { describe, expect, it } from 'vitest';
import { Card, DECK, makeCard } from '../cards';
import { GameState, dealNext, newGame } from '../game';
import { seededRng } from '../random';
import { seatView } from '../view';
import { solveEndgame } from './endgame';
import { sampleDeal } from './sample';

function dealt(players: 2 | 4, seed: number): GameState {
  let s = newGame({ players, targetScore: 31, accusi: false, signals: players === 4 }, seededRng(seed));
  while (s.phase === 'dealing') s = dealNext(s);
  return s;
}

describe('sampleDeal', () => {
  it('keeps our hand, hand sizes and the stock size, and uses every card exactly once', () => {
    const s = dealt(2, 9);
    const world = sampleDeal(seatView(s, 0), seededRng(1));
    expect(world.hands[0]).toEqual(s.hands[0]);
    expect(world.hands.map((h) => h.length)).toEqual(s.hands.map((h) => h.length));
    expect(world.stock).toHaveLength(s.stock.length);
    const ids = [...world.hands.flat(), ...world.stock].map((c) => c.id).sort();
    expect(ids).toEqual(DECK.map((c) => c.id).sort());
  });

  it('never gives a seat a suit it has shown it lacks', () => {
    const base = dealt(4, 4);
    // Seat 1 failed to follow coppe earlier, so it has none left.
    const s: GameState = {
      ...base,
      tricks: [
        {
          winner: 0,
          plays: [
            { seat: 0, card: base.hands[0][0] },
            { seat: 1, card: base.hands[1].find((c) => c.suit !== base.hands[0][0].suit)! },
          ],
        },
      ],
    };
    const ledSuit = base.hands[0][0].suit;
    for (let seed = 1; seed <= 20; seed++) {
      const world = sampleDeal(seatView(s, 0), seededRng(seed));
      expect(world.hands[1].some((c) => c.suit === ledSuit)).toBe(false);
    }
  });
});

describe('solveEndgame', () => {
  it('finds the line that wins the most points with full knowledge', () => {
    // Our hand: 3 and 4 of coppe. Theirs: the Asso and 5 of coppe (everything else is played).
    const mine = [makeCard('coppe', 3), makeCard('coppe', 4)];
    const theirs = [makeCard('coppe', 1), makeCard('coppe', 5)];
    const played = DECK.filter((c) => ![...mine, ...theirs].some((x: Card) => x.id === c.id));
    const base = dealt(2, 1);
    const s: GameState = {
      ...base,
      stock: [],
      turn: 0,
      hands: [mine, theirs],
      tricks: Array.from({ length: 18 }, (_, i) => ({
        winner: 0,
        plays: [
          { seat: 0, card: played[2 * i] },
          { seat: 1, card: played[2 * i + 1] },
        ],
      })),
    };
    // Leading the 3: they duck with the 5 and take the last trick (and its bonus) with the Asso: net -5 thirds.
    // Leading the 4: their best is the Asso now (-3), then our 3 beats their 5 on the last trick (+4): net +1.
    expect(solveEndgame(seatView(s, 0)).id).toBe('4-coppe');

    // Replying to their 5 on the table: ducking with the 4 lets our 3 catch their Asso on the last trick (+7),
    // while taking it with the 3 hands them the Asso trick and the bonus (-5).
    const replying: GameState = { ...s, turn: 0, hands: [mine, [theirs[0]]], trick: [{ seat: 1, card: theirs[1] }] };
    expect(solveEndgame(seatView(replying, 0)).id).toBe('4-coppe');
  });
});
