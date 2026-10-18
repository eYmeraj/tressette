import { DECK, SUITS, cardIndex, thirds } from '../cards';
import { HAND_SIZE, Signal, teamOf, winningPlayIndex } from '../game';
import { SeatView, legalPlays, unseenCards } from '../view';
import { knownCards, voids } from '../bots/sample';

/** One output per card of the deck, in DECK order: the network scores every card and illegal ones are masked. */
export const ACTIONS = DECK.length;

const SIGNALS: Signal[] = ['busso', 'volo', 'striscio'];
const TOTAL_THIRDS = 35; // every card's thirds plus the last-trick bonus

/** Length of `encode`'s output for a game of `players`. */
export function featureCount(players: 2 | 4): number {
  const n = players;
  return (
    40 + // our hand
    40 * n + // played in earlier tricks, by each seat
    40 * n + // on the table now, by each seat
    40 * (n - 1) + // known to be in another seat's hand (drawn face up, shown in an accuso)
    4 * (n - 1) + // suits another seat has shown it lacks
    4 + // suit led in this trick
    n + // how many cards are already on the table
    1 + // our team is winning this trick
    2 + // thirds each team has taken this hand
    2 + // tricks played, cards left in the stock
    3 + // game score of each team, target
    (n === 4 ? 3 * 4 * (n - 1) : 0) // signals each other seat has made, by suit
  );
}

/**
 * Everything `v` lets this seat know, as numbers for a network. Seats are numbered relative to ours (0 = us,
 * 1 = the next to play after us, and in 4-player 2 = our partner), so one network can play from any seat.
 * Built only from the SeatView, so it can't leak hidden cards.
 */
export function encode(v: SeatView): Float32Array {
  const n = v.config.players;
  const x = new Float32Array(featureCount(n));
  const rel = (seat: number) => (seat - v.seat + n) % n;
  const team = teamOf(v.config, v.seat);
  let o = 0;

  for (const c of v.hand) x[o + cardIndex(c)] = 1;
  o += 40;

  for (const t of v.tricks) for (const p of t.plays) x[o + 40 * rel(p.seat) + cardIndex(p.card)] = 1;
  o += 40 * n;

  for (const p of v.trick) x[o + 40 * rel(p.seat) + cardIndex(p.card)] = 1;
  o += 40 * n;

  const known = knownCards(v, new Set(unseenCards(v).map((c) => c.id)));
  for (const [id, seat] of known) x[o + 40 * (rel(seat) - 1) + cardIndex(DECK.find((c) => c.id === id)!)] = 1;
  o += 40 * (n - 1);

  voids(v).forEach((suits, seat) => {
    if (seat === v.seat) return;
    for (const s of suits) x[o + 4 * (rel(seat) - 1) + SUITS.indexOf(s)] = 1;
  });
  o += 4 * (n - 1);

  if (v.trick.length) x[o + SUITS.indexOf(v.trick[0].card.suit)] = 1;
  o += 4;

  x[o + v.trick.length] = 1;
  o += n;

  if (v.trick.length) x[o] = teamOf(v.config, v.trick[winningPlayIndex(v.trick)].seat) === team ? 1 : 0;
  o += 1;

  for (const t of v.tricks) {
    const pts = t.plays.reduce((sum, p) => sum + thirds(p.card), 0);
    x[o + (teamOf(v.config, t.winner) === team ? 0 : 1)] += pts / TOTAL_THIRDS;
  }
  o += 2;

  x[o] = v.tricks.length / (DECK.length / n);
  x[o + 1] = v.stockSize / (DECK.length - n * HAND_SIZE);
  o += 2;

  const target = v.config.targetScore;
  x[o] = v.scores[team] / target;
  x[o + 1] = v.scores[1 - team] / target;
  x[o + 2] = target / 41;
  o += 3;

  if (n === 4) {
    for (const e of v.events) {
      if (e.type !== 'signal' || e.seat === v.seat) continue;
      x[o + 12 * (rel(e.seat) - 1) + 3 * SUITS.indexOf(e.suit) + SIGNALS.indexOf(e.signal)] = 1;
    }
    o += 3 * 4 * (n - 1);
  }

  if (o !== x.length) throw new Error(`encode wrote ${o} features, expected ${x.length}`);
  return x;
}

/** 1 for each card (in DECK order) this seat may play now. */
export function legalMask(v: SeatView): Uint8Array {
  const mask = new Uint8Array(ACTIONS);
  for (const c of legalPlays(v)) mask[cardIndex(c)] = 1;
  return mask;
}
