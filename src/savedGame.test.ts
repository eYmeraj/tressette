import { describe, expect, it } from 'vitest';
import { collectTrick, dealNext, legalMoves, newGame, playCard } from './engine/game';
import { parseSave, serializeSave } from './savedGame';

describe('saved game', () => {
  it('restores a game part-way through a hand exactly', () => {
    let s = newGame({ players: 2, targetScore: 31, accusi: false, signals: false });
    while (s.phase === 'dealing') s = dealNext(s);
    s = playCard(s, s.turn, legalMoves(s, s.turn)[0].id);
    s = playCard(s, s.turn, legalMoves(s, s.turn)[0].id);
    s = collectTrick(s);
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it('ignores missing, corrupt and other-version saves', () => {
    const s = newGame({ players: 4, targetScore: 21, accusi: true, signals: true });
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave(JSON.stringify({ version: 0, state: s }))).toBeNull();
    expect(parseSave(JSON.stringify({ version: 1, state: { phase: 'playing' } }))).toBeNull();
  });
});
