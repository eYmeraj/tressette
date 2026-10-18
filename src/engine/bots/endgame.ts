import { Card, SUITS, strength, thirds } from '../cards';
import { SeatView, legalPlays, unseenCards } from '../view';

const LAST_TRICK_BONUS = 3; // thirds

/**
 * Perfect play once the 2-player stock is empty: every card the opponent holds is then known (the rest of the
 * deck), so the remaining tricks are a full-information game. Solves it exactly with memoised minimax over
 * which cards each side still holds, and returns the card that maximises our thirds minus theirs.
 *
 * Hands are bitmasks over the (at most 20) cards still in hand, so the search is integer work only.
 */
export function solveEndgame(v: SeatView): Card {
  const led = v.trick[0];
  // Their card already on the table (if we're replying) takes part in the first trick but is in no hand.
  const cards = [...v.hand, ...unseenCards(v), ...(led ? [led.card] : [])];
  const suitOf = cards.map((c) => SUITS.indexOf(c.suit));
  const suitBits = SUITS.map((_, s) => suitOf.reduce((m, cs, i) => (cs === s ? m | (1 << i) : m), 0));
  const power = cards.map(strength);
  const points = cards.map(thirds);
  const memo = new Map<number, number>();

  const lowest = (mask: number) => 31 - Math.clz32(mask & -mask);
  /** The cards in `mask` that may answer `lead`: its suit if held, otherwise anything. */
  const replies = (mask: number, lead: number) => mask & suitBits[suitOf[lead]] || mask;
  const replyBeats = (lead: number, reply: number) => suitOf[reply] === suitOf[lead] && power[reply] > power[lead];

  /** Plays out one trick: who takes it, and our points minus theirs from it. */
  const trick = (meLeads: boolean, lead: number, reply: number, last: boolean) => {
    const meWins = meLeads !== replyBeats(lead, reply);
    const pts = points[lead] + points[reply] + (last ? LAST_TRICK_BONUS : 0);
    return { meWins, gain: meWins ? pts : -pts };
  };

  /** Best achievable (ours − theirs) over the remaining tricks, with `meLeads` deciding who leads next. */
  const value = (myMask: number, theirMask: number, meLeads: boolean): number => {
    if (!myMask) return 0;
    const key = (myMask * 1048576 + theirMask) * 2 + (meLeads ? 1 : 0);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const leaderMask = meLeads ? myMask : theirMask;
    const replierMask = meLeads ? theirMask : myMask;
    let best = meLeads ? -Infinity : Infinity;
    for (let l = leaderMask; l; l &= l - 1) {
      const lead = lowest(l);
      const leaderLeft = leaderMask & ~(1 << lead);
      let worst = meLeads ? Infinity : -Infinity;
      for (let r = replies(replierMask, lead); r; r &= r - 1) {
        const reply = lowest(r);
        const replierLeft = replierMask & ~(1 << reply);
        const { meWins, gain } = trick(meLeads, lead, reply, leaderLeft === 0);
        const total = gain + (meLeads ? value(leaderLeft, replierLeft, meWins) : value(replierLeft, leaderLeft, meWins));
        worst = meLeads ? Math.min(worst, total) : Math.max(worst, total);
      }
      best = meLeads ? Math.max(best, worst) : Math.min(best, worst);
    }
    memo.set(key, best);
    return best;
  };

  const myMask = (1 << v.hand.length) - 1;
  const theirMask = ((1 << (v.hand.length + unseenCards(v).length)) - 1) & ~myMask;
  const index = (c: Card) => cards.findIndex((x) => x.id === c.id);

  const score = (c: Card): number => {
    const me = index(c);
    const myLeft = myMask & ~(1 << me);
    if (led) {
      // Replying to their card on the table.
      const { meWins, gain } = trick(false, cards.length - 1, me, myLeft === 0);
      return gain + value(myLeft, theirMask, meWins);
    }
    // Leading: they answer as well as they can.
    let worst = Infinity;
    for (let r = replies(theirMask, me); r; r &= r - 1) {
      const reply = lowest(r);
      const { meWins, gain } = trick(true, me, reply, myLeft === 0);
      worst = Math.min(worst, gain + value(myLeft, theirMask & ~(1 << reply), meWins));
    }
    return worst;
  };

  const scored = legalPlays(v).map((c) => ({ c, score: score(c) }));
  return scored.reduce((best, x) => (x.score > best.score ? x : best)).c;
}
