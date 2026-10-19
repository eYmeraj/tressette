import { collectAndDraw, dealNext, newGame } from '../src/engine/game';
import { seededRng } from '../src/engine/random';
import { legalPlays, seatView } from '../src/engine/view';
import { applyMove } from '../src/engine/bots/types';
import { botFromSpec } from './botspec';

for (const spec of process.argv.slice(2).filter((a) => a !== '--')) {
  const bot = botFromSpec(spec);
  const times: number[] = [];
  for (let seed = 1; seed <= 3; seed++) {
    const rng = seededRng(seed);
    let s = newGame({ players: 2, targetScore: 31, accusi: false, signals: false }, rng);
    while (s.phase === 'dealing') s = dealNext(s);
    while (s.phase === 'playing' || s.phase === 'trickComplete') {
      if (s.phase === 'trickComplete') { s = collectAndDraw(s); continue; }
      const v = seatView(s, s.turn);
      const t = performance.now();
      const move = bot.chooseMove(v, rng);
      if (legalPlays(v).length > 1) times.push(performance.now() - t);
      s = applyMove(s, s.turn, move);
    }
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${spec.replace(/ml\/models\//g, '')}: mean ${mean.toFixed(0)} ms, median ${times[times.length >> 1].toFixed(0)} ms`);
}
