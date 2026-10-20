import { DECK, SUITS, cardIndex, strength, thirds } from '../cards';
import { HAND_SIZE, LAST_TRICK_BONUS, Signal, teamOf, winningPlayIndex } from '../game';
import { SeatView, legalPlays, unseenCards } from '../view';
import { knownCards, voids } from '../bots/sample';

/** One output per card of the deck, in DECK order: the network scores every card and illegal ones are masked. */
export const ACTIONS = DECK.length;

const SIGNALS: Signal[] = ['busso', 'volo', 'striscio'];
const TOTAL_THIRDS = DECK.reduce((sum, c) => sum + thirds(c), LAST_TRICK_BONUS); // 35
const RANKS_PER_SUIT = DECK.length / SUITS.length;

/**
 * How a block of features reacts when the suits are relabelled: one slot per card (DECK order, suit-major),
 * one per suit, one per suit and signal, or not at all.
 */
type Kind = 'card' | 'suit' | 'suitSignal' | 'plain';

interface Block {
  name: string;
  kind: Kind;
  /** Copies of the block, e.g. one per seat. */
  repeat: number;
  /** Length of one copy, for 'plain' blocks (the others follow from their kind). */
  size?: number;
}

const KIND_SIZE: Record<Exclude<Kind, 'plain'>, number> = { card: DECK.length, suit: SUITS.length, suitSignal: SUITS.length * SIGNALS.length };

/** The feature vector, block by block. Seats are relative to ours: 0 = us, 1 = next to play after us. */
function layout(n: 2 | 4): Block[] {
  return [
    { name: 'hand', kind: 'card', repeat: 1 },
    { name: 'played', kind: 'card', repeat: n }, // in earlier tricks, by each seat
    { name: 'table', kind: 'card', repeat: n }, // on the table now, by each seat
    { name: 'known', kind: 'card', repeat: n - 1 }, // in another seat's hand: drawn face up, shown in an accuso
    { name: 'voids', kind: 'suit', repeat: n - 1 }, // suits another seat has shown it lacks
    { name: 'lead', kind: 'suit', repeat: 1 }, // suit led in this trick
    { name: 'position', kind: 'plain', repeat: 1, size: n }, // how many cards are already on the table
    { name: 'winning', kind: 'plain', repeat: 1, size: 1 }, // our team is winning this trick
    { name: 'taken', kind: 'plain', repeat: 1, size: 2 }, // thirds each team has taken this hand
    { name: 'progress', kind: 'plain', repeat: 1, size: 2 }, // tricks played, cards left in the stock
    { name: 'score', kind: 'plain', repeat: 1, size: 3 }, // game score of each team, target
    ...(n === 4 ? [{ name: 'signals', kind: 'suitSignal' as const, repeat: n - 1 }] : []), // by each other seat
    // Derived from the blocks above (see `derive`), so the network needn't work them out. Kept last, so a network
    // trained before they existed still reads its inputs as a prefix.
    { name: 'outCount', kind: 'suit', repeat: 1 }, // cards of each suit not yet played and not ours, / 10
    { name: 'outThirds', kind: 'suit', repeat: 1 }, // their points, / 8 (a whole suit is worth 8 thirds)
    { name: 'ourCount', kind: 'suit', repeat: 1 }, // cards of each suit we hold, / 10
    { name: 'ourMaster', kind: 'suit', repeat: 1 }, // we hold the strongest card of the suit still in play
    { name: 'theirMaster', kind: 'suit', repeat: 1 }, // another seat is known to hold it
  ];
}

/** The number of features before the derived blocks: what networks trained before them expect. */
export function baseFeatureCount(players: 2 | 4): number {
  const at = offsets(players);
  return at.outCount;
}

/**
 * Fills the derived blocks of `x` from its other blocks. Works on the vector alone, so recorded training data can
 * be brought up to date without replaying the games (scripts/derive-features.ts).
 */
export function derive(x: Float32Array, players: 2 | 4): Float32Array {
  const n = players;
  const at = offsets(n);
  const per = RANKS_PER_SUIT;
  for (let s = 0; s < SUITS.length; s++) {
    let out = 0, outPts = 0, ours = 0, best = -1, bestOurs = false, bestKnown = false;
    for (let r = 0; r < per; r++) {
      const i = s * per + r;
      let gone = false;
      for (let seat = 0; seat < n; seat++) gone ||= x[at.played + 40 * seat + i] > 0 || x[at.table + 40 * seat + i] > 0;
      if (gone) continue;
      const held = x[at.hand + i] > 0;
      let known = false;
      for (let seat = 0; seat < n - 1; seat++) known ||= x[at.known + 40 * seat + i] > 0;
      if (held) ours++;
      else {
        out++;
        outPts += thirds(DECK[i]);
      }
      const st = strength(DECK[i]);
      if (st > best) [best, bestOurs, bestKnown] = [st, held, known];
    }
    x[at.outCount + s] = out / per;
    x[at.outThirds + s] = outPts / 8;
    x[at.ourCount + s] = ours / per;
    x[at.ourMaster + s] = best >= 0 && bestOurs ? 1 : 0;
    x[at.theirMaster + s] = best >= 0 && bestKnown ? 1 : 0;
  }
  return x;
}

const blockSize = (b: Block) => (b.kind === 'plain' ? b.size! : KIND_SIZE[b.kind]);

/** Where each block starts. */
function offsets(n: 2 | 4): Record<string, number> {
  const out: Record<string, number> = {};
  let o = 0;
  for (const b of layout(n)) {
    out[b.name] = o;
    o += blockSize(b) * b.repeat;
  }
  return out;
}

/** Length of `encode`'s output for a game of `players`. */
export function featureCount(players: 2 | 4): number {
  return layout(players).reduce((sum, b) => sum + blockSize(b) * b.repeat, 0);
}

/**
 * Everything `v` lets this seat know, as numbers for a network. Seats are numbered relative to ours (0 = us,
 * 1 = the next to play after us, and in 4-player 2 = our partner), so one network can play from any seat.
 * Built only from the SeatView, so it can't leak hidden cards.
 */
export function encode(v: SeatView): Float32Array {
  const n = v.config.players;
  const at = offsets(n);
  const x = new Float32Array(featureCount(n));
  const rel = (seat: number) => (seat - v.seat + n) % n;
  const team = teamOf(v.config, v.seat);

  for (const c of v.hand) x[at.hand + cardIndex(c)] = 1;
  for (const t of v.tricks) for (const p of t.plays) x[at.played + 40 * rel(p.seat) + cardIndex(p.card)] = 1;
  for (const p of v.trick) x[at.table + 40 * rel(p.seat) + cardIndex(p.card)] = 1;

  const known = knownCards(v, new Set(unseenCards(v).map((c) => c.id)));
  for (const [id, seat] of known) x[at.known + 40 * (rel(seat) - 1) + cardIndex(DECK.find((c) => c.id === id)!)] = 1;

  voids(v).forEach((suits, seat) => {
    if (seat === v.seat) return;
    for (const s of suits) x[at.voids + 4 * (rel(seat) - 1) + SUITS.indexOf(s)] = 1;
  });

  if (v.trick.length) x[at.lead + SUITS.indexOf(v.trick[0].card.suit)] = 1;
  x[at.position + v.trick.length] = 1;
  if (v.trick.length) x[at.winning] = teamOf(v.config, v.trick[winningPlayIndex(v.trick)].seat) === team ? 1 : 0;

  for (const t of v.tricks) {
    const pts = t.plays.reduce((sum, p) => sum + thirds(p.card), 0);
    x[at.taken + (teamOf(v.config, t.winner) === team ? 0 : 1)] += pts / TOTAL_THIRDS;
  }

  x[at.progress] = v.tricks.length / (DECK.length / n);
  x[at.progress + 1] = v.stockSize / (DECK.length - n * HAND_SIZE);

  const target = v.config.targetScore;
  x[at.score] = v.scores[team] / target;
  x[at.score + 1] = v.scores[1 - team] / target;
  x[at.score + 2] = target / 41;

  if (n === 4) {
    for (const e of v.events) {
      if (e.type !== 'signal' || e.seat === v.seat) continue;
      x[at.signals + 12 * (rel(e.seat) - 1) + 3 * SUITS.indexOf(e.suit) + SIGNALS.indexOf(e.signal)] = 1;
    }
  }
  return derive(x, n);
}

/** 1 for each card (in DECK order) this seat may play now. */
export function legalMask(v: SeatView): Uint8Array {
  const mask = new Uint8Array(ACTIONS);
  for (const c of legalPlays(v)) mask[cardIndex(c)] = 1;
  return mask;
}

/** All 24 orderings of the 4 suits. */
export function suitPermutations(): number[][] {
  const out: number[][] = [];
  const build = (prefix: number[]) => {
    if (prefix.length === SUITS.length) out.push(prefix);
    else for (let s = 0; s < SUITS.length; s++) if (!prefix.includes(s)) build([...prefix, s]);
  };
  build([]);
  return out;
}

/**
 * Tressette treats every suit alike, so relabelling the suits of a position (suit s becomes perm[s]) gives an
 * equally valid one with the same card scores, relabelled. Returns index maps for that: the relabelled position's
 * features are `x[features[i]]` and its card scores `q[actions[i]]`. Used to multiply the training data 24-fold.
 */
export function suitPermutationMaps(players: 2 | 4, perm: number[]): { features: Int32Array; actions: Int32Array } {
  const inverse = perm.map((_, s) => perm.indexOf(s));
  const card = (i: number) => inverse[Math.floor(i / RANKS_PER_SUIT)] * RANKS_PER_SUIT + (i % RANKS_PER_SUIT);
  const features = new Int32Array(featureCount(players));
  let o = 0;
  for (const b of layout(players)) {
    const size = blockSize(b);
    for (let r = 0; r < b.repeat; r++, o += size) {
      for (let i = 0; i < size; i++) {
        const from =
          b.kind === 'card' ? card(i)
          : b.kind === 'suit' ? inverse[i]
          : b.kind === 'suitSignal' ? inverse[Math.floor(i / SIGNALS.length)] * SIGNALS.length + (i % SIGNALS.length)
          : i;
        features[o + i] = o + from;
      }
    }
  }
  return { features, actions: Int32Array.from({ length: ACTIONS }, (_, i) => card(i)) };
}
