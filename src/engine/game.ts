import { Card, Suit, newDeck, shuffle, thirds } from './cards';
import { Accuso, findAccusi, legalCards, trickWinnerIndex } from './rules';

export type Signal = 'busso' | 'volo' | 'striscio';

export interface GameConfig {
  players: 2 | 4;
  targetScore: number;
  accusi: boolean;
  /** Only meaningful with 4 players: the trick leader may signal their partner. */
  signals: boolean;
}

export interface Play {
  seat: number;
  card: Card;
  signal?: Signal;
}

export interface CompletedTrick {
  plays: Play[];
  winner: number;
}

export interface Declaration {
  seat: number;
  accusi: Accuso[];
}

export interface HandResult {
  /** Card points per team in thirds, excluding the last-trick bonus. */
  cardThirds: number[];
  lastTrickTeam: number;
  accusiPoints: number[];
  points: number[];
}

export type GameEvent =
  | { type: 'declare'; seat: number; accusi: Accuso[] }
  | { type: 'signal'; seat: number; signal: Signal; suit: Suit }
  | { type: 'trick'; winner: number; thirds: number }
  | { type: 'draw'; seat: number; card: Card }
  | { type: 'hand'; result: HandResult };

export type Phase = 'playing' | 'trickComplete' | 'handOver' | 'gameOver';

export interface GameState {
  config: GameConfig;
  phase: Phase;
  handNumber: number;
  dealer: number;
  turn: number;
  hands: Card[][];
  /** Undealt cards; only used in the 2-player game, where both players draw after each trick. */
  stock: Card[];
  trick: Play[];
  tricks: CompletedTrick[];
  declarations: Declaration[];
  hasPlayed: boolean[];
  scores: [number, number];
  handResult: HandResult | null;
  /** Winning team once the game is over. */
  winner: number | null;
  /** Events of the current hand, oldest first. */
  events: GameEvent[];
}

export type Rng = () => number;

const LAST_TRICK_BONUS = 3; // thirds

/** Seats go counterclockwise. With 4 players, partners sit opposite (seats 0+2 and 1+3). */
export function teamOf(config: GameConfig, seat: number): number {
  return config.players === 4 ? seat % 2 : seat;
}

export function newGame(config: GameConfig, rng: Rng = Math.random): GameState {
  return deal(config, config.players - 1, 1, [0, 0], rng);
}

function deal(config: GameConfig, dealer: number, handNumber: number, scores: [number, number], rng: Rng): GameState {
  const n = config.players;
  const deck = shuffle(newDeck(), rng);
  return {
    config,
    phase: 'playing',
    handNumber,
    dealer,
    turn: (dealer + 1) % n,
    hands: Array.from({ length: n }, (_, i) => deck.slice(i * 10, i * 10 + 10)),
    stock: deck.slice(n * 10),
    trick: [],
    tricks: [],
    declarations: [],
    hasPlayed: Array(n).fill(false),
    scores,
    handResult: null,
    winner: null,
    events: [],
  };
}

/** Accusi must be declared before the player's first card of the hand. */
export function availableAccusi(s: GameState, seat: number): Accuso[] {
  if (!s.config.accusi || s.phase !== 'playing' || s.hasPlayed[seat]) return [];
  if (s.declarations.some((d) => d.seat === seat)) return [];
  return findAccusi(s.hands[seat]);
}

export function declare(s: GameState, seat: number): GameState {
  const accusi = availableAccusi(s, seat);
  if (!accusi.length) throw new Error(`Seat ${seat} has nothing to declare`);
  return {
    ...s,
    declarations: [...s.declarations, { seat, accusi }],
    events: [...s.events, { type: 'declare', seat, accusi }],
  };
}

export function legalMoves(s: GameState, seat: number): Card[] {
  if (s.phase !== 'playing' || s.turn !== seat) return [];
  return legalCards(s.hands[seat], s.trick[0]?.card.suit ?? null);
}

export function canSignal(s: GameState, seat: number): boolean {
  return (
    s.config.signals && s.config.players === 4 && s.phase === 'playing' && s.turn === seat && s.trick.length === 0
  );
}

export function playCard(s: GameState, seat: number, cardId: string, signal?: Signal): GameState {
  const card = legalMoves(s, seat).find((c) => c.id === cardId);
  if (!card) throw new Error(`Illegal play ${cardId} by seat ${seat}`);
  if (signal && !canSignal(s, seat)) throw new Error('Signals are not allowed now');

  const n = s.config.players;
  const trick = [...s.trick, signal ? { seat, card, signal } : { seat, card }];
  const full = trick.length === n;
  return {
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h.filter((c) => c.id !== cardId) : h)),
    trick,
    hasPlayed: s.hasPlayed.map((p, i) => p || i === seat),
    phase: full ? 'trickComplete' : 'playing',
    turn: full ? s.turn : (seat + 1) % n,
    events: signal ? [...s.events, { type: 'signal', seat, signal, suit: card.suit }] : s.events,
  };
}

/** Awards the finished trick; in the 2-player game the winner then the loser draw from the stock. */
export function collectTrick(s: GameState): GameState {
  if (s.phase !== 'trickComplete') throw new Error('No completed trick to collect');
  const n = s.config.players;
  const winner = s.trick[trickWinnerIndex(s.trick.map((p) => p.card))].seat;
  const events: GameEvent[] = [
    ...s.events,
    { type: 'trick', winner, thirds: s.trick.reduce((sum, p) => sum + thirds(p.card), 0) },
  ];

  let { hands, stock } = s;
  if (stock.length >= n) {
    hands = hands.map((h) => [...h]);
    for (let i = 0; i < n; i++) {
      const seat = (winner + i) % n;
      hands[seat].push(stock[i]);
      events.push({ type: 'draw', seat, card: stock[i] });
    }
    stock = stock.slice(n);
  }

  const next: GameState = {
    ...s,
    hands,
    stock,
    trick: [],
    tricks: [...s.tricks, { plays: s.trick, winner }],
    phase: 'playing',
    turn: winner,
    events,
  };
  return hands.every((h) => h.length === 0) ? finishHand(next) : next;
}

function finishHand(s: GameState): GameState {
  const { config } = s;
  const cardThirds = [0, 0];
  for (const t of s.tricks) {
    cardThirds[teamOf(config, t.winner)] += t.plays.reduce((sum, p) => sum + thirds(p.card), 0);
  }
  const lastTrickTeam = teamOf(config, s.tricks[s.tricks.length - 1].winner);
  const accusiPoints = [0, 0];
  for (const d of s.declarations) {
    accusiPoints[teamOf(config, d.seat)] += d.accusi.reduce((sum, a) => sum + a.points, 0);
  }
  // Leftover thirds are dropped, so card play is always worth 11 points per hand.
  const points = [0, 1].map(
    (t) => Math.floor((cardThirds[t] + (t === lastTrickTeam ? LAST_TRICK_BONUS : 0)) / 3) + accusiPoints[t],
  );
  const scores: [number, number] = [s.scores[0] + points[0], s.scores[1] + points[1]];
  const result: HandResult = { cardThirds, lastTrickTeam, accusiPoints, points };
  const over = scores.some((x) => x >= config.targetScore) && scores[0] !== scores[1];
  return {
    ...s,
    scores,
    handResult: result,
    phase: over ? 'gameOver' : 'handOver',
    winner: over ? (scores[0] > scores[1] ? 0 : 1) : null,
    events: [...s.events, { type: 'hand', result }],
  };
}

export function nextHand(s: GameState, rng: Rng = Math.random): GameState {
  if (s.phase !== 'handOver') throw new Error('Hand is not over');
  return deal(s.config, (s.dealer + 1) % s.config.players, s.handNumber + 1, s.scores, rng);
}
