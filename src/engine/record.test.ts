import { describe, expect, it } from 'vitest';
import { GameState, collectAndDraw, dealNext, newGame } from './game';
import { seededRng } from './random';
import { BOTS, applyBotMove } from './bots';
import { HandRecord, recordHand, replayHand } from './record';

/** A hand played to the end by the classic bot: the state as dealt and the state at the end. */
function playedHand(players: 2 | 4, seed: number): { start: GameState; end: GameState } {
  const rng = seededRng(seed);
  const start = newGame({ players, targetScore: 31, accusi: true, signals: players === 4 }, rng);
  let s = start;
  while (s.phase === 'dealing') s = dealNext(s);
  while (s.phase === 'playing' || s.phase === 'trickComplete') {
    s = s.phase === 'trickComplete' ? collectAndDraw(s) : applyBotMove(s, BOTS.classic, rng);
  }
  return { start, end: s };
}

describe('hand records', () => {
  for (const players of [2, 4] as const) {
    it(`replay to the same result (${players} players)`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const { start, end } = playedHand(players, seed);
        const record: HandRecord = JSON.parse(JSON.stringify(recordHand(start, end)));
        const replayed = replayHand(record);
        expect(replayed.handResult).toEqual(end.handResult);
        expect(replayed.scores).toEqual(end.scores);
        expect(replayed.events).toEqual(end.events);
      }
    });
  }

  it('reject impossible hands', () => {
    const { start, end } = playedHand(2, 3);
    const good = recordHand(start, end);
    const swapped = { ...good, plays: [good.plays[1], good.plays[0], ...good.plays.slice(2)] };
    expect(() => replayHand(swapped)).toThrow();
    expect(() => replayHand({ ...good, plays: good.plays.slice(0, -1) })).toThrow();
    expect(() => replayHand({ ...good, deck: [...good.deck.slice(1), good.deck[1]] })).toThrow();
    expect(() => replayHand({ ...good, accusi: [...good.accusi, 0, 1].filter((v, i, a) => a.indexOf(v) === i) })).toThrow();
  });
});
