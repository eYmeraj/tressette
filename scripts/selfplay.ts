/**
 * Self-play data for the ML bot: the Stats bot plays every seat, and each decision it makes is saved with its
 * score for every legal card, so a network can learn to score cards the same way.
 *
 * Usage: npm run selfplay -- --out ml/data/run-1 [--hands 500] [--players 2|4] [--samples 120] [--explore 0.1] [--seed 1]
 *
 * Writes raw little-endian arrays next to a meta.json (read them with numpy.fromfile), one row per decision:
 *   x.f32     encode(view), featureCount(players) floats
 *   mask.u8   legalMask(view), 40 bytes
 *   q.f32     the Stats bot's score per card (thirds, our team minus theirs at the end of the hand), 0 if illegal
 *   z.f32     what our team actually ended the hand with, minus theirs
 * Positions with only one legal card are skipped. With --explore, that share of moves is a random legal card
 * (still saved with the bot's scores), so the data also covers positions the bot itself wouldn't reach.
 */
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { cardIndex } from '../src/engine/cards';
import { GameConfig, GameState, collectAndDraw, dealNext, newGame, teamOf } from '../src/engine/game';
import { seededRng } from '../src/engine/random';
import { legalPlays, seatView } from '../src/engine/view';
import { applyMove } from '../src/engine/bots';
import { moveWith, statsScores } from '../src/engine/bots/stats';
import { ACTIONS, encode, featureCount, legalMask } from '../src/engine/ml/encode';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

const out = arg('out');
const hands = Number(arg('hands', '500'));
const players = Number(arg('players', '2')) as 2 | 4;
const samples = Number(arg('samples', '120'));
const explore = Number(arg('explore', '0.1'));
const firstSeed = Number(arg('seed', '1'));
const LAST_TRICK_BONUS = 3;

mkdirSync(out, { recursive: true });
const files = Object.fromEntries(['x.f32', 'mask.u8', 'q.f32', 'z.f32'].map((f) => [f, openSync(join(out, f), 'w')]));
const write = (file: string, data: Float32Array | Uint8Array) =>
  writeSync(files[file], new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

let rows = 0;
const started = Date.now();
for (let h = 0; h < hands; h++) {
  const seed = firstSeed * 1_000_003 + h;
  const rng = seededRng(seed);
  // Mix in accusi so the network sees cards revealed by them.
  const config: GameConfig = { players, targetScore: 31, accusi: rng() < 0.5, signals: players === 4 };
  let s: GameState = newGame(config, rng);
  while (s.phase === 'dealing') s = dealNext(s);

  const decisions: { team: number; x: Float32Array; mask: Uint8Array; q: Float32Array }[] = [];
  while (s.phase === 'playing' || s.phase === 'trickComplete') {
    if (s.phase === 'trickComplete') {
      s = collectAndDraw(s);
      continue;
    }
    const v = seatView(s, s.turn);
    const legal = legalPlays(v);
    if (legal.length === 1) {
      s = applyMove(s, s.turn, moveWith(v, legal[0]));
      continue;
    }
    const scored = statsScores(v, rng, { samples, endgame: true });
    const q = new Float32Array(ACTIONS);
    for (const { card, score } of scored) q[cardIndex(card)] = score;
    decisions.push({ team: teamOf(config, s.turn), x: encode(v), mask: legalMask(v), q });
    const best = scored.reduce((b, x) => (x.score > b.score ? x : b)).card;
    const card = rng() < explore ? legal[Math.floor(rng() * legal.length)] : best;
    s = applyMove(s, s.turn, moveWith(v, card));
  }

  const r = s.handResult!;
  const total = (t: number) => r.cardThirds[t] + (r.lastTrickTeam === t ? LAST_TRICK_BONUS : 0);
  for (const d of decisions) {
    write('x.f32', d.x);
    write('mask.u8', d.mask);
    write('q.f32', d.q);
    write('z.f32', new Float32Array([total(d.team) - total(1 - d.team)]));
  }
  rows += decisions.length;
  writeFileSync(
    join(out, 'meta.json'),
    JSON.stringify({ players, features: featureCount(players), actions: ACTIONS, rows, hands: h + 1, samples, explore }, null, 2),
  );
  if ((h + 1) % 25 === 0 || h + 1 === hands) {
    const secs = (Date.now() - started) / 1000;
    console.log(`${out}: ${h + 1}/${hands} hands, ${rows} rows, ${(rows / secs).toFixed(1)} rows/s`);
  }
}
for (const fd of Object.values(files)) closeSync(fd);
