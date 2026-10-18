import { Card, Suit, newDeck, shuffle, thirds } from './cards';
import { Accuso, findAccusi, legalCards, trickWinnerIndex } from './rules';
import type { BotId } from './bots';

export type Signal = 'busso' | 'volo' | 'striscio';

export interface GameConfig {
  players: 2 | 4;
  targetScore: number;
  accusi: boolean;
  /** Only meaningful with 4 players: the trick leader may signal their partner. */
  signals: boolean;
  /** Which bot plays the other seats (see BOTS); missing in games saved before bots were selectable. */
  bot?: BotId;
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

export interface AccusiCall {
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
  | { type: 'accuso'; seat: number; accusi: Accuso[] }
  | { type: 'signal'; seat: number; signal: Signal; suit: Suit }
  | { type: 'trick'; winner: number; thirds: number }
  | { type: 'draw'; seat: number; card: Card }
  | { type: 'hand'; result: HandResult };

export type Phase = 'dealing' | 'playing' | 'trickComplete' | 'handOver' | 'gameOver';

export interface GameState {
  config: GameConfig;
  phase: Phase;
  handNumber: number;
  dealer: number;
  turn: number;
  /** Each seat's full hand, decided at the deal; see `visibleHand` while dealing. */
  hands: Card[][];
  /** Cards handed out so far in the 'dealing' phase, one at a time round-robin from the dealer's right. */
  dealt: number;
  /** Undealt cards; only used in the 2-player game, where both players draw after each trick. */
  stock: Card[];
  trick: Play[];
  tricks: CompletedTrick[];
  accusiCalls: AccusiCall[];
  hasPlayed: boolean[];
  scores: [number, number];
  handResult: HandResult | null;
  /** Winning team once the game is over. */
  winner: number | null;
  /** Events of the current hand, oldest first. */
  events: GameEvent[];
}

export type Rng = () => number;

export const HAND_SIZE = 10;
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
    phase: 'dealing',
    handNumber,
    dealer,
    turn: (dealer + 1) % n,
    hands: Array.from({ length: n }, (_, i) => deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)),
    dealt: 0,
    stock: deck.slice(n * HAND_SIZE),
    trick: [],
    tricks: [],
    accusiCalls: [],
    hasPlayed: Array(n).fill(false),
    scores,
    handResult: null,
    winner: null,
    events: [],
  };
}

/** Hands out the next card; play starts once every seat has HAND_SIZE cards. */
export function dealNext(s: GameState): GameState {
  if (s.phase !== 'dealing') throw new Error('Not dealing');
  const dealt = s.dealt + 1;
  return { ...s, dealt, phase: dealt === s.config.players * HAND_SIZE ? 'playing' : 'dealing' };
}

/** Deal step k gives seat (dealer + 1 + k) % n its card number floor(k / n). */
function dealSeat(s: GameState, step: number): number {
  return (s.dealer + 1 + step) % s.config.players;
}

/** The cards a seat holds so far: the full hand, or while dealing only those already handed out. */
export function visibleHand(s: GameState, seat: number): Card[] {
  if (s.phase !== 'dealing') return s.hands[seat];
  const n = s.config.players;
  const offset = (seat - s.dealer - 1 + n) % n;
  return s.hands[seat].slice(0, Math.max(0, Math.ceil((s.dealt - offset) / n)));
}

/** Face-down pile on the table: cards still to be dealt, then the stock, top first. */
export function deckCards(s: GameState): Card[] {
  if (s.phase !== 'dealing') return s.stock;
  const n = s.config.players;
  const undealt = [];
  for (let k = s.dealt; k < n * HAND_SIZE; k++) undealt.push(s.hands[dealSeat(s, k)][Math.floor(k / n)]);
  return [...undealt, ...s.stock];
}

/** Accusi must be called before the player's first card of the hand. */
export function availableAccusi(s: GameState, seat: number): Accuso[] {
  if (!s.config.accusi || s.phase !== 'playing' || s.hasPlayed[seat]) return [];
  if (s.accusiCalls.some((d) => d.seat === seat)) return [];
  return findAccusi(s.hands[seat]);
}

export function callAccusi(s: GameState, seat: number): GameState {
  const accusi = availableAccusi(s, seat);
  if (!accusi.length) throw new Error(`Seat ${seat} has no accusi to call`);
  return {
    ...s,
    accusiCalls: [...s.accusiCalls, { seat, accusi }],
    events: [...s.events, { type: 'accuso', seat, accusi }],
  };
}

export function legalMoves(s: GameState, seat: number): Card[] {
  if (s.phase !== 'playing' || s.turn !== seat) return [];
  return legalCards(s.hands[seat], s.trick[0]?.card.suit ?? null);
}

export function canSignal(s: Pick<GameState, 'config' | 'phase' | 'turn' | 'trick'>, seat: number): boolean {
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

/** Position in the trick of the play that takes it. */
export function winningPlayIndex(trick: Play[]): number {
  return trickWinnerIndex(trick.map((p) => p.card));
}

/** The seat whose card takes the trick. */
export function trickWinner(trick: Play[]): number {
  return trick[winningPlayIndex(trick)].seat;
}

/** Awards the finished trick; in the 2-player game the winner then the loser draw from the stock. */
export function collectTrick(s: GameState): GameState {
  if (s.phase !== 'trickComplete') throw new Error('No completed trick to collect');
  const n = s.config.players;
  const winner = trickWinner(s.trick);
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
  for (const d of s.accusiCalls) {
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
