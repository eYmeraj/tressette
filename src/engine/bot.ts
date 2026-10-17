import { Card, Suit, newDeck, strength, thirds } from './cards';
import { trickWinnerIndex } from './rules';
import { GameState, Signal, availableAccusi, canSignal, legalMoves, teamOf } from './game';

export interface BotMove {
  cardId: string;
  signal?: Signal;
  declare: boolean;
}

/**
 * Heuristic player. It only uses information a real player has: its own hand,
 * the cards already played, and its partner's signals.
 */
export function chooseMove(s: GameState, seat: number): BotMove {
  const legal = legalMoves(s, seat);
  if (!legal.length) throw new Error(`Seat ${seat} cannot play now`);
  const declare = availableAccusi(s, seat).length > 0;
  const unseen = unseenCards(s, seat);

  if (s.trick.length > 0) return { cardId: chooseFollow(s, seat, legal, unseen).id, declare };

  const card = chooseLead(s, seat, unseen);
  const signal = canSignal(s, seat) ? chooseSignal(s.hands[seat], card, unseen) : undefined;
  return { cardId: card.id, signal, declare };
}

function unseenCards(s: GameState, seat: number): Card[] {
  const seen = new Set(s.hands[seat].map((c) => c.id));
  for (const t of s.tricks) for (const p of t.plays) seen.add(p.card.id);
  for (const p of s.trick) seen.add(p.card.id);
  return newDeck().filter((c) => !seen.has(c.id));
}

/** No card still out there can beat this one in its suit. */
function isMaster(card: Card, unseen: readonly Card[]): boolean {
  return !unseen.some((u) => u.suit === card.suit && strength(u) > strength(card));
}

function maxBy<T>(items: readonly T[], score: (t: T) => number): T {
  return items.reduce((best, t) => (score(t) > score(best) ? t : best));
}

function minBy<T>(items: readonly T[], score: (t: T) => number): T {
  return maxBy(items, (t) => -score(t));
}

/** How much we'd regret losing this card: points first, then trick-taking power. */
function keepValue(card: Card): number {
  return thirds(card) * 10 + strength(card);
}

/** Preference when feeding a trick our team is sure to win: Asso, then figures; keep 3s and 2s. */
function feedValue(card: Card): number {
  if (card.rank === 1) return 100;
  if (card.rank >= 8) return 50 + strength(card);
  if (card.rank <= 3) return -strength(card);
  return strength(card);
}

function chooseLead(s: GameState, seat: number, unseen: Card[]): Card {
  const hand = s.hands[seat];

  // Cash a master Asso, or clear the way for one with a master 3/2 of the same suit.
  const masterAce = hand.find((c) => c.rank === 1 && isMaster(c, unseen));
  if (masterAce) return masterAce;
  const opener = hand.find(
    (c) => (c.rank === 3 || c.rank === 2) && isMaster(c, unseen) && hand.some((h) => h.suit === c.suit && h.rank === 1),
  );
  if (opener) return opener;

  // Answer the partner's most recent signal in a suit we still hold.
  if (s.config.players === 4) {
    const partner = (seat + 2) % 4;
    for (let i = s.tricks.length - 1; i >= 0; i--) {
      const lead = s.tricks[i].plays[0];
      if (lead.seat !== partner || !lead.signal || lead.signal === 'volo') continue;
      const inSuit = hand.filter((c) => c.suit === lead.card.suit);
      if (inSuit.length) return lead.signal === 'busso' ? maxBy(inSuit, strength) : minBy(inSuit, strength);
    }
  }

  // Otherwise lead from the longest suit, never a lone Asso.
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
  const suits = [...bySuit.values()];
  const candidates = suits.filter((cards) => !(cards.length === 1 && cards[0].rank === 1));
  const suit = maxBy(candidates.length ? candidates : suits, (cards) => cards.length * 10 - cards.filter((c) => c.rank === 1).length);
  const low = suit.filter((c) => c.rank >= 4 && c.rank <= 7);
  if (low.length) return minBy(low, strength);
  const three = suit.find((c) => c.rank === 3);
  if (three) return three;
  return minBy(suit, keepValue);
}

function chooseSignal(hand: Card[], led: Card, unseen: Card[]): Signal | undefined {
  const rest = hand.filter((c) => c.suit === led.suit && c.id !== led.id);
  if (rest.length === 0) return 'volo';
  if (rest.some((c) => (c.rank === 1 || c.rank === 2) && !isMaster(c, unseen))) return 'busso';
  if (rest.length >= 3) return 'striscio';
  return undefined;
}

function chooseFollow(s: GameState, seat: number, legal: Card[], unseen: Card[]): Card {
  const { config, trick } = s;
  const leadSuit = trick[0].card.suit;
  const winning = trick[trickWinnerIndex(trick.map((p) => p.card))];
  const myTeam = teamOf(config, seat);
  const partnerWinning = teamOf(config, winning.seat) === myTeam;
  const last = trick.length === config.players - 1;
  const trickThirds = trick.reduce((sum, p) => sum + thirds(p.card), 0);

  if (partnerWinning && (last || isMaster(winning.card, unseen))) return maxBy(legal, feedValue);

  const beats = (c: Card) => c.suit === leadSuit && strength(c) > strength(winning.card);
  const winners = legal.filter(beats);

  // Partner knocked: take the trick with our best card if it can win.
  const lead = trick[0];
  if (lead.signal === 'busso' && teamOf(config, lead.seat) === myTeam && winners.length && !partnerWinning) {
    return maxBy(winners, strength);
  }

  if (winners.length && !partnerWinning) {
    const ace = winners.find((c) => c.rank === 1);
    if (last) return ace ?? minBy(winners, strength);
    const safe = winners.filter((c) => isMaster(c, unseen));
    if (safe.length) return safe.find((c) => c.rank === 1) ?? minBy(safe, strength);
    if (trickThirds >= 3) return maxBy(winners, strength);
  }

  return minBy(legal, keepValue);
}
