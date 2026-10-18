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
 *
 * Safe to interrupt: meta.json is rewritten after every hand, and rerunning the same command carries on from the
 * last finished hand (dropping any half-written rows). Every hand has its own seed, so the result is the same as
 * an uninterrupted run. Rerunning with a larger --hands extends a finished run.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, truncateSync, writeFileSync, writeSync } from 'node:fs';
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

const settings = { players, features: featureCount(players), actions: ACTIONS, samples, explore, seed: firstSeed };
const rowBytes: Record<string, number> = { 'x.f32': 4 * settings.features, 'mask.u8': ACTIONS, 'q.f32': 4 * ACTIONS, 'z.f32': 4 };
const metaPath = join(out, 'meta.json');

mkdirSync(out, { recursive: true });
let rows = 0;
let done = 0;
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  for (const [k, v] of Object.entries(settings)) {
    if (meta[k] !== v) throw new Error(`${out} was made with ${k}=${meta[k]}, not ${v}: use another --out`);
  }
  ({ rows, hands: done } = meta);
  console.log(`${out}: resuming after ${done} hands (${rows} rows)`);
}
// Drop rows written after the last meta.json (an interrupted hand), then append.
const files = Object.fromEntries(
  Object.keys(rowBytes).map((f) => {
    const path = join(out, f);
    if (existsSync(path)) truncateSync(path, rows * rowBytes[f]);
    return [f, openSync(path, 'a')];
  }),
);
const write = (file: string, data: Float32Array | Uint8Array) =>
  writeSync(files[file], new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
/** Written to a temporary file and renamed, so an interruption never leaves a half-written meta.json. */
const saveMeta = (handsDone: number) => {
  writeFileSync(`${metaPath}.tmp`, JSON.stringify({ ...settings, rows, hands: handsDone }, null, 2));
  renameSync(`${metaPath}.tmp`, metaPath);
};

const started = Date.now();
const startRows = rows;
for (let h = done; h < hands; h++) {
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
  saveMeta(h + 1);
  if ((h + 1) % 25 === 0 || h + 1 === hands) {
    const secs = (Date.now() - started) / 1000;
    console.log(`${out}: ${h + 1}/${hands} hands, ${rows} rows, ${((rows - startRows) / secs).toFixed(1)} rows/s`);
  }
}
for (const fd of Object.values(files)) closeSync(fd);
