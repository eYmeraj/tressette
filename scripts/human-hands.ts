/**
 * Turns hands shared by players (exported from D1, see worker/README.md) into training data: each hand is replayed,
 * and at every decision with a choice the teacher scores every legal card, exactly as in self-play. The network
 * then learns from positions real people get into, scored by the search rather than copied from the person.
 *
 * Usage: npm run -s human-hands -- --in hands.json --out ml/data/human-1 [--teacher "search:src/engine/ml/weights-2p.json,samples=40"] [--seats all|human]
 *
 * --in is the JSON printed by `npx wrangler d1 execute tressette-hands --remote --json --command "SELECT record FROM hands WHERE players = 2"`.
 * Writes the same files as scripts/selfplay.ts (x.f32, mask.u8, q.f32, meta.json), so train.py reads it as is.
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { cardIndex } from '../src/engine/cards';
import { HandRecord, replayHand } from '../src/engine/record';
import { seededRng } from '../src/engine/random';
import { legalPlays, seatView } from '../src/engine/view';
import { ACTIONS, encode, featureCount, legalMask } from '../src/engine/ml/encode';
import { scorerFromSpec } from './botspec';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

const input = arg('in');
const out = arg('out');
const teacher = arg('teacher', 'search:src/engine/ml/weights-2p.json,samples=40');
const seats = arg('seats', 'all');
const score = scorerFromSpec(teacher);
const rng = seededRng(1);

// wrangler prints [{ results: [{ record: "..." }, ...], ... }]
const exported = JSON.parse(readFileSync(input, 'utf8'));
const records: HandRecord[] = (Array.isArray(exported) ? exported : [exported])
  .flatMap((r: { results?: { record: string }[] }) => r.results ?? [])
  .map((row: { record: string }) => JSON.parse(row.record))
  .filter((r: HandRecord) => r.config.players === 2);

mkdirSync(out, { recursive: true });
const files = Object.fromEntries(['x.f32', 'mask.u8', 'q.f32'].map((f) => [f, openSync(join(out, f), 'w')]));
const write = (file: string, data: Float32Array | Uint8Array) => writeSync(files[file], new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

let rows = 0;
let skipped = 0;
for (const r of records) {
  const decisions: { x: Float32Array; mask: Uint8Array; q: Float32Array }[] = [];
  try {
    replayHand(r, (s, p) => {
      const v = seatView(s, p.seat);
      if (legalPlays(v).length < 2 || (seats !== 'all' && p.seat !== 0)) return;
      const q = new Float32Array(ACTIONS);
      for (const { card, score: sc } of score(v, rng)) q[cardIndex(card)] = sc;
      decisions.push({ x: encode(v), mask: legalMask(v), q });
    });
  } catch {
    skipped++; // a hand that doesn't replay is left out
    continue;
  }
  for (const d of decisions) {
    write('x.f32', d.x);
    write('mask.u8', d.mask);
    write('q.f32', d.q);
  }
  rows += decisions.length;
}
for (const fd of Object.values(files)) closeSync(fd);
const meta = { players: 2, features: featureCount(2), actions: ACTIONS, teacher, seats, source: input, rows, hands: records.length - skipped, skipped };
writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`${out}: ${meta.hands} hands, ${rows} positions (${skipped} hands skipped)`);
