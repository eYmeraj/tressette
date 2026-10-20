import { describe, expect, it } from 'vitest';
import worker from './index';
import { GameState, collectAndDraw, dealNext, newGame } from '../../src/engine/game';
import { BOTS, applyBotMove } from '../../src/engine/bots';
import { recordHand } from '../../src/engine/record';
import { seededRng } from '../../src/engine/random';

const ORIGIN = 'https://eymeraj.github.io';

function sharedHand(): Record<string, unknown> {
  const rng = seededRng(1);
  const start = newGame({ players: 2, targetScore: 31, accusi: false, signals: false }, rng);
  let s: GameState = start;
  while (s.phase === 'dealing') s = dealNext(s);
  while (s.phase === 'playing' || s.phase === 'trickComplete') s = s.phase === 'trickComplete' ? collectAndDraw(s) : applyBotMove(s, BOTS.classic, rng);
  return { record: recordHand(start, s), player: 'p', game: 'g', bot: 'classic', app: 'test' };
}

/** A stand-in for the Worker's bindings; `run` is the database write. */
function env(run: () => Promise<unknown> = async () => ({ success: true })) {
  const stored: unknown[][] = [];
  const db = { prepare: () => ({ bind: (...values: unknown[]) => ({ run: () => (stored.push(values), run()) }) }) };
  return { stored, env: { ALLOWED_ORIGINS: ORIGIN, LIMITER: { limit: async () => ({ success: true }) }, DB: db } as unknown as Env };
}

const post = (body: unknown, origin = ORIGIN) =>
  new Request('https://hands.example/hands', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('hand-sharing Worker', () => {
  it('stores a real hand', async () => {
    const { stored, env: e } = env();
    const res = await worker.fetch(post(sharedHand()), e);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(stored).toHaveLength(1);
  });

  it('rejects an impossible hand for good (422) and stores nothing', async () => {
    const hand = sharedHand();
    const record = hand.record as { plays: unknown[] };
    const { stored, env: e } = env();
    const res = await worker.fetch(post({ ...hand, record: { ...record, plays: [record.plays[1], record.plays[0], ...record.plays.slice(2)] } }), e);
    expect(res.status).toBe(422);
    expect(stored).toHaveLength(0);
  });

  it('answers 503 when the database fails, so the app keeps the hand and retries', async () => {
    const { env: e } = env(async () => {
      throw new Error('D1_ERROR: Network connection lost.');
    });
    expect((await worker.fetch(post(sharedHand()), e)).status).toBe(503);
  });

  it('refuses other websites', async () => {
    const { stored, env: e } = env();
    expect((await worker.fetch(post(sharedHand(), 'https://elsewhere.example'), e)).status).toBe(403);
    expect(stored).toHaveLength(0);
  });
});
