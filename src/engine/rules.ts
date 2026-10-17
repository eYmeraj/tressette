import { Card, Rank, SUITS, SUIT_NAMES, Suit, strength } from './cards';

/** Players must follow the led suit when they can; there are no trumps. */
export function legalCards(hand: readonly Card[], leadSuit: Suit | null): Card[] {
  if (!leadSuit) return [...hand];
  const following = hand.filter((c) => c.suit === leadSuit);
  return following.length ? following : [...hand];
}

/** Index (into `cards`) of the card that takes the trick: strongest card of the led suit. */
export function trickWinnerIndex(cards: readonly Card[]): number {
  const lead = cards[0].suit;
  let best = 0;
  cards.forEach((c, i) => {
    if (c.suit === lead && strength(c) > strength(cards[best])) best = i;
  });
  return best;
}

export interface Accuso {
  kind: 'napoletana' | 'tris' | 'poker';
  label: string;
  points: number;
  cards: Card[];
}

const PLURAL: Partial<Record<Rank, string>> = { 1: 'Assi', 2: 'Due', 3: 'Tre' };

/**
 * Declarations ("accusi") available in a hand:
 * - Napoletana: Asso, 2 and 3 of the same suit — 3 points
 * - Three Assi, 2s or 3s — 3 points; all four — 4 points
 */
export function findAccusi(hand: readonly Card[]): Accuso[] {
  const out: Accuso[] = [];
  for (const suit of SUITS) {
    const napoletana = hand.filter((c) => c.suit === suit && c.rank <= 3);
    if (napoletana.length === 3) {
      out.push({ kind: 'napoletana', label: `Napoletana di ${SUIT_NAMES[suit]}`, points: 3, cards: napoletana });
    }
  }
  for (const rank of [1, 2, 3] as const) {
    const same = hand.filter((c) => c.rank === rank);
    if (same.length >= 3) {
      const poker = same.length === 4;
      out.push({
        kind: poker ? 'poker' : 'tris',
        label: `${poker ? 'Poker' : 'Tris'} di ${PLURAL[rank]}`,
        points: same.length,
        cards: same,
      });
    }
  }
  return out;
}
