/**
 * Receives hands shared from the game (src/sharing.ts), replays each one with the game's own engine to make sure
 * it's a real, legal hand, and stores it in D1. See worker/README.md for setting it up.
 *
 * `Env` (the DB binding and ALLOWED_ORIGINS) is generated from wrangler.toml by `npx wrangler types`
 * (worker-configuration.d.ts); rerun it after changing the bindings.
 */
import type { GameConfig, Signal } from '../../src/engine/game';
import { HandRecord, replayHand } from '../../src/engine/record';

const MAX_BYTES = 20_000; // a hand is ~2 KB
const TARGETS = [21, 31, 41];
const SIGNALS: Signal[] = ['busso', 'volo', 'striscio'];

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return origin && allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', vary: 'origin' }
    : {};
}

function fail(why: string): never {
  throw new Error(why);
}

const text = (v: unknown, max: number): string => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail('Bad metadata'));
const int = (v: unknown, min: number, max: number, what: string): number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fail(`Bad ${what}`);
const list = (v: unknown, what: string): unknown[] => (Array.isArray(v) && v.length <= 64 ? v : fail(`Bad ${what}`));

/**
 * The record rebuilt from the input, field by field: only the fields a HandRecord has, each type-checked. Anything
 * else in the input is dropped, so what's stored is exactly what replays.
 */
function canonicalRecord(raw: unknown): HandRecord {
  const r = (raw && typeof raw === 'object' ? raw : fail('Missing record')) as Record<string, unknown>;
  const c = (r.config && typeof r.config === 'object' ? r.config : fail('Bad config')) as Record<string, unknown>;
  // Only 2-player hands for now (the ML bots are 2-player only).
  if (c.players !== 2) fail('Only 2-player hands are collected');
  if (!TARGETS.includes(c.targetScore as number) || typeof c.accusi !== 'boolean' || typeof c.signals !== 'boolean') fail('Bad config');
  const config: GameConfig = { players: 2, targetScore: c.targetScore as number, accusi: c.accusi, signals: c.signals };
  const scores = list(r.scores, 'scores');
  if (scores.length !== 2) fail('Bad scores');
  return {
    v: r.v === 1 ? 1 : fail('Unknown record version'),
    config,
    dealer: int(r.dealer, 0, 1, 'dealer'),
    handNumber: int(r.handNumber, 1, 200, 'hand number'),
    scores: [int(scores[0], 0, 99, 'scores'), int(scores[1], 0, 99, 'scores')],
    deck: list(r.deck, 'deck').map((id) => text(id, 12)),
    plays: list(r.plays, 'plays').map((p) => {
      const o = (p && typeof p === 'object' ? p : fail('Bad play')) as Record<string, unknown>;
      const play: HandRecord['plays'][number] = { seat: int(o.seat, 0, 1, 'seat'), card: text(o.card, 12) };
      if (o.signal !== undefined) play.signal = SIGNALS.includes(o.signal as Signal) ? (o.signal as Signal) : fail('Bad signal');
      return play;
    }),
    accusi: list(r.accusi, 'accusi').map((seat) => int(seat, 0, 1, 'accusi')),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(req.headers.get('origin'), env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST' || url.pathname !== '/hands') return new Response('Not found', { status: 404, headers });
    if (!headers['access-control-allow-origin']) return new Response('Origin not allowed', { status: 403 });
    // Refuse oversized bodies before reading them (and again after, in case the header was missing or wrong).
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return new Response('Too large', { status: 413, headers });
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return new Response('Too large', { status: 413, headers });

    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      const meta = { player: text(body.player, 64), game: text(body.game, 64), bot: text(body.bot, 32), app: text(body.app, 64) };
      const record = canonicalRecord(body.record);
      const points = replayHand(record).handResult!.points;
      // A hand is stored once, however many times it's sent.
      await env.DB.prepare(
        `INSERT OR IGNORE INTO hands (received_at, player, game, hand_number, bot, app, players, points_0, points_1, record)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(new Date().toISOString(), meta.player, meta.game, record.handNumber, meta.bot, meta.app, 2, points[0], points[1], JSON.stringify(record))
        .run();
    } catch (e) {
      return new Response(`Rejected: ${(e as Error).message}`, { status: 422, headers });
    }
    return new Response(null, { status: 204, headers });
  },
} satisfies ExportedHandler<Env>;
