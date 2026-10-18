import { Card, Suit, shuffle } from '../cards';
import { GameState, HAND_SIZE, Rng } from '../game';
import { SeatView, unseenCards } from '../view';

/** Seat index used for the face-down stock while sampling (it has no suit constraints). */
const STOCK = -1;

/** Suits each seat has shown it lacks: by not following the lead, or by signalling Volo on its last card. */
function voids(v: SeatView): Set<Suit>[] {
  const out = Array.from({ length: v.config.players }, () => new Set<Suit>());
  for (const plays of [...v.tricks.map((t) => t.plays), v.trick]) {
    const lead = plays[0];
    if (!lead) continue;
    if (lead.signal === 'volo') out[lead.seat].add(lead.card.suit);
    for (const p of plays.slice(1)) if (p.card.suit !== lead.card.suit) out[p.seat].add(lead.card.suit);
  }
  return out;
}

/** Cards known to be in another seat's hand: drawn face up (2-player) or shown in an accuso, not yet played. */
function knownCards(v: SeatView, unseen: Set<string>): Map<string, number> {
  const known = new Map<string, number>();
  for (const e of v.events) {
    if (e.type === 'draw' && e.seat !== v.seat && unseen.has(e.card.id)) known.set(e.card.id, e.seat);
  }
  for (const call of v.accusiCalls) {
    if (call.seat === v.seat) continue;
    for (const a of call.accusi) for (const c of a.cards) if (unseen.has(c.id)) known.set(c.id, call.seat);
  }
  return known;
}

/**
 * One full game state consistent with everything this seat knows: the hidden cards are dealt at random to the
 * other hands and the stock, respecting known cards, shown voids and hand sizes.
 */
export function sampleDeal(v: SeatView, rng: Rng): GameState {
  const n = v.config.players;
  const unseen = unseenCards(v);
  const known = knownCards(v, new Set(unseen.map((c) => c.id)));
  const empty = voids(v);
  const others = Array.from({ length: n }, (_, i) => i).filter((i) => i !== v.seat);

  const deal = (respectVoids: boolean): { hands: Card[][]; stock: Card[] } | null => {
    const hands: Card[][] = Array.from({ length: n }, (_, i) => (i === v.seat ? [...v.hand] : []));
    const stock: Card[] = [];
    const cap = new Map<number, number>(others.map((i) => [i, v.handSizes[i]]));
    cap.set(STOCK, v.stockSize);
    const free: Card[] = [];
    for (const c of unseen) {
      const seat = known.get(c.id);
      if (seat === undefined) free.push(c);
      else {
        hands[seat].push(c);
        cap.set(seat, cap.get(seat)! - 1);
      }
    }
    for (const c of shuffle(free, rng)) {
      const options = [...cap].filter(([seat, left]) => left > 0 && !(respectVoids && seat !== STOCK && empty[seat].has(c.suit)));
      const total = options.reduce((sum, [, left]) => sum + left, 0);
      if (!total) return null;
      // Weighted by space left, so every consistent deal is about equally likely.
      let pick = rng() * total;
      const [seat] = options.find(([, left]) => (pick -= left) < 0) ?? options[options.length - 1];
      cap.set(seat, cap.get(seat)! - 1);
      (seat === STOCK ? stock : hands[seat]).push(c);
    }
    return { hands, stock };
  };

  let dealt: { hands: Card[][]; stock: Card[] } | null = null;
  for (let attempt = 0; attempt < 30 && !dealt; attempt++) dealt = deal(true);
  dealt ??= deal(false)!;

  return {
    config: v.config,
    phase: v.phase,
    handNumber: v.handNumber,
    dealer: v.dealer,
    turn: v.turn,
    hands: dealt.hands,
    dealt: n * HAND_SIZE,
    stock: dealt.stock,
    drawn: [],
    trick: v.trick,
    tricks: v.tricks,
    accusiCalls: v.accusiCalls,
    hasPlayed: v.hasPlayed,
    scores: v.scores,
    handResult: null,
    winner: null,
    events: v.events,
  };
}
