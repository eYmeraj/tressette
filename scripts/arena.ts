/**
 * Bot-vs-bot arena: plays seeded games between two bots and reports how they compare.
 *
 * Usage: npm run arena -- --a classic --b classic [--games 1000] [--players 2|4] [--target 31] [--seed 1]
 *
 * Bots are named as in scripts/botspec.ts, e.g. --a neural:src/engine/ml/weights-2p.json. With --json it prints one
 * line of totals instead (used by ml/gauntlet.py, which runs several seed ranges in parallel and adds them up).
 *
 * Each seed is played twice with the bots swapping sides (same shuffles, "duplicate" style), so luck of the
 * deal mostly cancels out and small differences in strength show up with fewer games.
 */
import { Player, applyBotMove } from '../src/engine/bots';
import { GameConfig, GameState, collectAndDraw, dealNext, newGame, nextHand, teamOf } from '../src/engine/game';
import { seededRng } from '../src/engine/random';
import { botFromSpec } from './botspec';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Plays one full game; `bots[team]` plays every seat of that team. */
function playGame(config: GameConfig, bots: [Player, Player], seed: number) {
  const rng = seededRng(seed);
  let s: GameState = newGame(config, rng);
  const handPoints = [0, 0];
  let hands = 0;
  const tally = () => {
    handPoints[0] += s.handResult!.points[0];
    handPoints[1] += s.handResult!.points[1];
    hands++;
  };
  while (s.phase !== 'gameOver') {
    if (s.phase === 'dealing') s = dealNext(s);
    else if (s.phase === 'trickComplete') s = collectAndDraw(s);
    else if (s.phase === 'handOver') {
      tally();
      s = nextHand(s, rng);
    } else s = applyBotMove(s, bots[teamOf(config, s.turn)], rng);
  }
  tally();
  return { winner: s.winner!, handPoints, hands };
}

const a = botFromSpec(arg('a', 'classic'));
const b = botFromSpec(arg('b', 'classic'));
const games = Number(arg('games', '1000'));
const players = Number(arg('players', '2')) as 2 | 4;
const config: GameConfig = { players, targetScore: Number(arg('target', '31')), accusi: false, signals: players === 4 };
const firstSeed = Number(arg('seed', '1'));

let aWins = 0;
// Per seed: a's points minus b's over both games of the pair, for a confidence interval that uses the pairing.
const pairMargins: number[] = [];
let aPoints = 0;
let bPoints = 0;
let hands = 0;
const started = Date.now();
for (let g = 0; g < games; g++) {
  // Odd games replay the previous seed with the bots on the other team.
  const seed = firstSeed + Math.floor(g / 2);
  const aTeam = g % 2;
  const result = playGame(config, aTeam === 0 ? [a, b] : [b, a], seed);
  if (result.winner === aTeam) aWins++;
  aPoints += result.handPoints[aTeam];
  bPoints += result.handPoints[1 - aTeam];
  const m = result.handPoints[aTeam] - result.handPoints[1 - aTeam];
  if (aTeam === 0) pairMargins.push(m);
  else pairMargins[pairMargins.length - 1] += m;
  hands += result.hands;
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ a: a.id, b: b.id, games, aWins, aPoints, bPoints, hands, pairMargins, ms: Date.now() - started }));
  process.exit(0);
}

const rate = aWins / games;
const margin = 1.96 * Math.sqrt((rate * (1 - rate)) / games);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`${a.id} vs ${b.id} · ${players} players · to ${config.targetScore} · ${games} games (${hands} hands)`);
console.log(`  ${a.id} wins ${pct(rate)} ± ${pct(margin)} (95% CI)`);
console.log(`  points per hand: ${a.id} ${(aPoints / hands).toFixed(2)} · ${b.id} ${(bPoints / hands).toFixed(2)}`);
console.log(`  ${((Date.now() - started) / games).toFixed(1)} ms per game`);
