/**
 * Brings recorded self-play data up to the current feature layout: keeps each row's original features, then fills
 * the derived blocks from them (see `derive` in src/engine/ml/encode.ts), into a new run directory.
 *
 * Usage: npm run -s derive-features -- ml/data/gen-01-1 [ml/data/gen-02-1 ...]   (writes ml/data/f2-<name>)
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { derive, featureCount } from '../src/engine/ml/encode';

for (const run of process.argv.slice(2).filter((a) => a !== '--')) {
  const meta = JSON.parse(readFileSync(join(run, 'meta.json'), 'utf8'));
  const players = meta.players as 2 | 4;
  const from = meta.features as number;
  const to = featureCount(players);
  const out = join(dirname(run), `f2-${basename(run)}`);
  mkdirSync(out, { recursive: true });
  const raw = readFileSync(join(run, 'x.f32'));
  const x = new Float32Array(raw.buffer, raw.byteOffset, meta.rows * from);
  const y = new Float32Array(meta.rows * to);
  for (let r = 0; r < meta.rows; r++) {
    const row = y.subarray(r * to, (r + 1) * to);
    row.set(x.subarray(r * from, (r + 1) * from));
    derive(row, players);
  }
  writeFileSync(join(out, 'x.f32'), new Uint8Array(y.buffer));
  for (const f of ['mask.u8', 'q.f32', 'z.f32']) copyFileSync(join(run, f), join(out, f));
  writeFileSync(join(out, 'meta.json'), JSON.stringify({ ...meta, features: to, derivedFrom: run }, null, 2));
  console.log(`${run} -> ${out}: ${meta.rows} rows, ${from} -> ${to} features`);
}
