import { Card, DECK, Suit, cardIndex, strength, thirds } from '../cards';
import { trickWinnerIndex } from '../rules';
import { Signal, canSignal, teamOf } from '../game';
import { SeatView, accusiFor, legalPlays, unseenCards } from '../view';
import type { BotMove } from './types';

/**
 * Heuristic player. It only uses information a real player has: its own hand,
 * the cards already played, and its partner's signals.
 */
export function classicMove(s: SeatView): BotMove {
  const { seat } = s;
  const legal = legalPlays(s);
  if (!legal.length) throw new Error(`Seat ${seat} cannot play now`);
  const callAccusi = accusiFor(s).length > 0;
  const unseen = unseenCards(s);

  if (s.trick.length > 0) return { cardId: chooseFollow(s, seat, legal, unseen).id, callAccusi };

  const card = chooseLead(s, seat, unseen);
  const signal = canSignal(s, seat) ? chooseSignal(s.hand, card, unseen) : undefined;
  return { cardId: card.id, signal, callAccusi };
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

function chooseLead(s: SeatView, seat: number, unseen: Card[]): Card {
  const hand = s.hand;

  // Cash a master Asso, or clear the way for one with a master 3/2 of the same suit.
  const masterAce = hand.find((c) => c.rank === 1 && isMaster(c, unseen));
  if (masterAce) return masterAce;
  const opener = hand.find(
    (c) => (c.rank === 3 || c.rank === 2) && isMaster(c, unseen) && hand.some((h) => h.suit === c.suit && h.rank === 1),
  );
  if (opener) return opener;

  // Answer the partner's latest signal, unless we've already led since (and so answered it).
  if (s.config.players === 4) {
    const partner = (seat + 2) % 4;
    for (let i = s.tricks.length - 1; i >= 0; i--) {
      const lead = s.tricks[i].plays[0];
      if (lead.seat === seat) break;
      if (lead.seat !== partner || !lead.signal || lead.signal === 'volo') continue;
      const inSuit = hand.filter((c) => c.suit === lead.card.suit);
      if (inSuit.length) return lead.signal === 'busso' ? maxBy(inSuit, strength) : minBy(inSuit, strength);
    }
  }

  // Otherwise lead from the longest suit, never a lone Asso, and avoid handing points
  // to an opponent known to hold a stronger card of that suit.
  const known = knownOpponentCards(s, seat, unseen);
  const gifts = (c: Card) => thirds(c) > 0 && known.some((k) => k.suit === c.suit && strength(k) > strength(c));
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
  const options = [...bySuit.values()]
    .filter((cards) => !(cards.length === 1 && cards[0].rank === 1))
    .map((cards) => ({ cards, lead: leadFromSuit(cards) }))
    .filter((o) => !gifts(o.lead));
  if (!options.length) return minBy(hand, keepValue);
  return maxBy(options, (o) => o.cards.length * 10 - o.cards.filter((c) => c.rank === 1).length).lead;
}

function leadFromSuit(cards: Card[]): Card {
  const low = cards.filter((c) => c.rank >= 4 && c.rank <= 7);
  if (low.length) return minBy(low, strength);
  return cards.find((c) => c.rank === 3) ?? minBy(cards, keepValue);
}

/** In the 2-player game drawn cards are shown face up, so we know some of the opponent's hand. */
function knownOpponentCards(s: SeatView, seat: number, unseen: readonly Card[]): Card[] {
  if (s.config.players !== 2) return [];
  const out = new Uint8Array(DECK.length);
  for (const c of unseen) out[cardIndex(c)] = 1;
  return s.events.flatMap((e) =>
    e.type === 'draw' && e.seat !== seat && out[cardIndex(e.card)] ? [e.card] : [],
  );
}

/** The signal a leader would give with `card`, if signals are allowed now. */
export function classicSignal(s: SeatView, card: Card): Signal | undefined {
  return canSignal(s, s.seat) ? chooseSignal(s.hand, card, unseenCards(s)) : undefined;
}

function chooseSignal(hand: Card[], led: Card, unseen: Card[]): Signal | undefined {
  const rest = hand.filter((c) => c.suit === led.suit && c.id !== led.id);
  if (rest.length === 0) return 'volo';
  if (rest.some((c) => (c.rank === 1 || c.rank === 2) && !isMaster(c, unseen))) return 'busso';
  if (rest.length >= 3) return 'striscio';
  return undefined;
}

function chooseFollow(s: SeatView, seat: number, legal: Card[], unseen: Card[]): Card {
  const { config, trick } = s;
  const leadSuit = trick[0].card.suit;
  const winning = trick[trickWinnerIndex(trick.map((p) => p.card))];
  const myTeam = teamOf(config, seat);
  const partnerWinning = teamOf(config, winning.seat) === myTeam;
  const last = trick.length === config.players - 1;
  const trickThirds = trick.reduce((sum, p) => sum + thirds(p.card), 0);

  const beats = (c: Card) => c.suit === leadSuit && strength(c) > strength(winning.card);
  const winners = legal.filter(beats);

  // Partner knocked: take the trick with our best card, even over the partner's own card.
  const lead = trick[0];
  if (lead.signal === 'busso' && teamOf(config, lead.seat) === myTeam && winners.length) {
    return maxBy(winners, strength);
  }

  if (partnerWinning && (last || isMaster(winning.card, unseen))) return maxBy(legal, feedValue);

  if (winners.length && !partnerWinning) {
    const ace = winners.find((c) => c.rank === 1);
    if (last) return ace ?? minBy(winners, strength);
    const safe = winners.filter((c) => isMaster(c, unseen));
    if (safe.length) return safe.find((c) => c.rank === 1) ?? minBy(safe, strength);
    if (trickThirds >= 3) return maxBy(winners, strength);
  }

  return minBy(legal, keepValue);
}
