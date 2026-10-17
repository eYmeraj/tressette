// Regenerates public/cards/*.webp from the public-domain Wikimedia Commons scan
// "Carte piacentine al completo.jpg" (see CREDITS.md).
// Usage: npm i --no-save sharp && node scripts/slice-cards.cjs <deck.jpg> public/cards
// Every card has a black inner frame of ~274x540px. In each cell of the 10x4 grid, find straight
// dark lines (tolerating slight tilt), pick the pair spaced like the frame, and crop around it.
const sharp = require('sharp');
const fs = require('fs');
const [src, outDir] = process.argv.slice(2);
const SUITS = ['denari', 'coppe', 'bastoni', 'spade'];
// Frames measured by hand where the line detector picks the wrong pair.
const OVERRIDES = { '2-bastoni': { x: 380, y: 1226 }, '8-spade': { x: 2475, y: 1832 } };
const FW = 274, FH = 540, TOL = 8, OUTSET = 26;

(async () => {
  const img = sharp(src);
  const { width: W, height: H } = await img.metadata();
  const g = await img.clone().greyscale().raw().toBuffer();
  const cw = W / 10, ch = H / 4;
  fs.mkdirSync(outDir, { recursive: true });

  function lines(axis, a, b, c0, c1) {
    const at = (i, j) => (axis === 'x' ? g[j * W + i] : g[i * W + j]);
    const max = axis === 'x' ? W : H;
    const hits = [];
    for (let i = Math.max(2, a); i < Math.min(max - 2, b); i++) {
      let n = 0;
      for (let j = c0; j < c1; j++) if (Math.min(at(i - 2, j), at(i - 1, j), at(i, j), at(i + 1, j), at(i + 2, j)) < 170) n++;
      if (n > (c1 - c0) * 0.85) hits.push(i);
    }
    const centers = []; let run = [];
    for (const i of hits) { if (run.length && i - run[run.length - 1] > 1) { centers.push(run[run.length >> 1]); run = []; } run.push(i); }
    if (run.length) centers.push(run[run.length >> 1]);
    return centers;
  }
  function pair(ls, size, center) {
    let best = null;
    for (const a of ls) for (const b of ls) {
      if (Math.abs(b - a - size) > TOL) continue;
      const score = Math.abs(b - a - size) * 4 + Math.abs((a + b) / 2 - center);
      if (!best || score < best.score) best = { a, b, score };
    }
    return best;
  }

  const found = {};
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
    const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch;
    const xs = lines('x', Math.round(c * cw - 60), Math.round((c + 1) * cw + 60), Math.round(cy - FH * 0.3), Math.round(cy + FH * 0.3));
    const ys = lines('y', Math.round(r * ch - 60), Math.round((r + 1) * ch + 60), Math.round(cx - FW * 0.3), Math.round(cx + FW * 0.3));
    const px = pair(xs, FW, cx), py = pair(ys, FH, cy);
    found[`${r},${c}`] = { x: px && px.a, y: py && py.a };
  }
  // Missing axis: use the median of the same column (x) or row (y).
  const med = (a) => { const s = a.filter((v) => v != null).sort((p, q) => p - q); return s[s.length >> 1]; };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
    const name = `${c + 1}-${SUITS[r]}`; // same as Card.id
    const f = OVERRIDES[name] ?? found[`${r},${c}`];
    if (f.x == null) { f.x = med([0, 1, 2, 3].map((rr) => found[`${rr},${c}`].x)); console.log(name, 'x from column'); }
    if (f.y == null) { f.y = med([...Array(10).keys()].map((cc) => found[`${r},${cc}`].y)); console.log(name, 'y from row'); }
    const left = Math.max(0, f.x - OUTSET), top = Math.max(0, f.y - OUTSET);
    const width = Math.min(W - left, FW + 2 * OUTSET), height = Math.min(H - top, FH + 2 * OUTSET);
    // 184px wide = 2x the largest on-screen card.
    await sharp(src).extract({ left, top, width, height }).resize(184).webp({ quality: 82 }).toFile(`${outDir}/${name}.webp`);
  }
})();
