/**
 * Receives hands shared from the game (src/sharing.ts), replays each one with the game's own engine to make sure
 * it's a real, legal hand, and stores it in D1. See worker/README.md for setting it up.
 */
import { HandRecord, replayHand } from '../../src/engine/record';

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
}

interface Env {
  DB: { prepare(sql: string): D1Statement };
  /** Comma-separated origins allowed to send hands, e.g. "https://eymeraj.github.io,http://localhost:5173". */
  ALLOWED_ORIGINS: string;
}

const MAX_BYTES = 20_000; // a hand is ~2 KB
const TARGETS = [21, 31, 41];

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return origin && allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', vary: 'origin' }
    : {};
}

const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

/** The parts of a shared hand that aren't checked by replaying it. */
function checkShape(body: Record<string, unknown>): HandRecord {
  if (!text(body.player, 64) || !text(body.game, 64) || !text(body.bot, 32) || !text(body.app, 64)) throw new Error('Bad metadata');
  const r = body.record as HandRecord;
  if (!r || typeof r !== 'object') throw new Error('Missing record');
  const c = r.config;
  // Only 2-player hands for now (the ML bots are 2-player only).
  if (!c || c.players !== 2) throw new Error('Only 2-player hands are collected');
  if (!TARGETS.includes(c.targetScore) || typeof c.accusi !== 'boolean' || typeof c.signals !== 'boolean') throw new Error('Bad config');
  if (!Array.isArray(r.scores) || r.scores.length !== 2 || !r.scores.every((x) => Number.isInteger(x) && x >= 0 && x < 100)) throw new Error('Bad scores');
  if (!Number.isInteger(r.handNumber) || r.handNumber < 1 || r.handNumber > 200) throw new Error('Bad hand number');
  if (!Array.isArray(r.deck) || !Array.isArray(r.plays) || !Array.isArray(r.accusi)) throw new Error('Bad record');
  return r;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(req.headers.get('origin'), env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST' || url.pathname !== '/hands') return new Response('Not found', { status: 404, headers });
    if (!headers['access-control-allow-origin']) return new Response('Origin not allowed', { status: 403 });

    const raw = await req.text();
    if (raw.length > MAX_BYTES) return new Response('Too large', { status: 413, headers });
    let record: HandRecord;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
      record = checkShape(body);
      const end = replayHand(record);
      const points = end.handResult!.points;
      // A hand is stored once, however many times it's sent.
      await env.DB.prepare(
        `INSERT OR IGNORE INTO hands (received_at, player, game, hand_number, bot, app, players, points_0, points_1, record)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(new Date().toISOString(), body.player, body.game, record.handNumber, body.bot, body.app, record.config.players, points[0], points[1], JSON.stringify(record))
        .run();
    } catch (e) {
      return new Response(`Rejected: ${(e as Error).message}`, { status: 422, headers });
    }
    return new Response(null, { status: 204, headers });
  },
};
