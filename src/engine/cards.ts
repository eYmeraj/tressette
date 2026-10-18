export const SUITS = ['coppe', 'denari', 'spade', 'bastoni'] as const;
export type Suit = (typeof SUITS)[number];

/** 1 = Asso, 8 = Fante, 9 = Cavallo, 10 = Re */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
  readonly id: string;
}

export function makeCard(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${rank}-${suit}` };
}

export const ASSO_DI_COPPE = makeCard('coppe', 1);

export function isAssoDiCoppe(card: Card): boolean {
  return card.id === ASSO_DI_COPPE.id;
}

export function newDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => makeCard(suit, rank)));
}

/** All 40 cards, built once, for lookups that don't need a fresh deck. */
export const DECK: readonly Card[] = newDeck();

const INDEX: Record<string, number> = Object.fromEntries(DECK.map((c, i) => [c.id, i]));

/** Position of a card in DECK (0–39): a cheap key for per-card flags. */
export function cardIndex(card: Card): number {
  return INDEX[card.id];
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Trick-taking order: 3 > 2 > Asso > Re > Cavallo > Fante > 7 > 6 > 5 > 4. */
const STRENGTH: Record<Rank, number> = { 3: 10, 2: 9, 1: 8, 10: 7, 9: 6, 8: 5, 7: 4, 6: 3, 5: 2, 4: 1 };

export function strength(card: Card): number {
  return STRENGTH[card.rank];
}

/** Card value in thirds of a point: Asso = 1 point, 2/3/figures = 1/3, the rest nothing. */
export function thirds(card: Card): number {
  if (card.rank === 1) return 3;
  if (card.rank === 2 || card.rank === 3 || card.rank >= 8) return 1;
  return 0;
}

export const RANK_NAMES: Record<Rank, string> = {
  1: 'Asso', 2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette',
  8: 'Fante', 9: 'Cavallo', 10: 'Re',
};

export const SUIT_NAMES: Record<Suit, string> = {
  coppe: 'Coppe', denari: 'Denari', spade: 'Spade', bastoni: 'Bastoni',
};

export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} di ${SUIT_NAMES[card.suit]}`;
}

/** Groups by suit, strongest first within each suit. */
export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || strength(b) - strength(a),
  );
}
