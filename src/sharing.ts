/// Sharing finished hands (if the player turns it on) to help train the bots. Sends only the cards and plays, an anonymous
/// random id, and which bot was played; never anything about the person. The setup screen explains it ("Sharing hands").
import { useEffect, useRef } from 'react';
import { GameState } from './engine/game';
import { HandRecord, recordHand } from './engine/record';
import { botIdFor } from './engine/bots';
import { read, remove, storedFlag, write } from './settings';

/** Where hands are sent (the Cloudflare Worker in worker/); without it the option isn't offered at all. */
export const HANDS_URL: string | undefined = import.meta.env.VITE_HANDS_URL || undefined;
const PLAYER_KEY = 'tressette.playerId';

// Off until the player turns it on: nothing is stored or sent without their say. Turning it off also drops hands
// still waiting to be sent.
const share = storedFlag('tressette.shareHands', false, (on) => on || remove(QUEUE_KEY));
export const useShareHands = share.use;

/** A random id for this browser, so hands from one person can be grouped; it says nothing about who they are. */
function playerId(): string {
  let id = read(PLAYER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    write(PLAYER_KEY, id);
  }
  return id;
}

export interface SharedHand {
  record: HandRecord;
  player: string;
  game: string;
  bot: string;
  app: string;
}

// Hands wait here until they're sent, so hands played offline go out once the device is back online.
const QUEUE_KEY = 'tressette.handsToSend';
/** Enough for weeks of offline play; past it the oldest hands are dropped. */
const MAX_QUEUED = 200;

function queued(): SharedHand[] {
  try {
    const hands = JSON.parse(read(QUEUE_KEY) ?? '[]');
    return Array.isArray(hands) ? hands : [];
  } catch {
    return [];
  }
}

function setQueued(hands: SharedHand[]) {
  if (hands.length) write(QUEUE_KEY, JSON.stringify(hands.slice(-MAX_QUEUED)));
  else remove(QUEUE_KEY);
}

const sameHand = (a: SharedHand, b: SharedHand) => a.game === b.game && a.record.handNumber === b.record.handNumber;

let flushing = false;

/** Sends the waiting hands, oldest first, stopping at the first that can't get through so it's tried again later. */
async function flush() {
  if (!HANDS_URL || !share.get() || flushing) return;
  flushing = true;
  try {
    for (let hand = queued()[0]; hand; hand = queued()[0]) {
      let res: Response;
      try {
        // keepalive: still delivered if the page is closing right after the hand.
        res = await fetch(`${HANDS_URL}/hands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(hand),
          keepalive: true,
        });
      } catch {
        return; // Offline or unreachable.
      }
      if (res.status === 429 || res.status >= 500) return;
      // Stored, or refused for good (the Worker stores a hand once however often it's sent, so a resend is harmless).
      const sent = hand;
      setQueued(queued().filter((h) => !sameHand(h, sent)));
    }
  } finally {
    flushing = false;
  }
}

function send(hand: SharedHand) {
  setQueued([...queued(), hand]);
  void flush();
}

if (typeof window !== 'undefined') {
  void flush();
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void flush());
}

/**
 * Records each 2-player hand from its deal to its end and, if the player turned sharing on, shares it. Hands resumed from a saved game
 * part-way through aren't shared, since their deal wasn't seen.
 */
export function useHandSharing(state: GameState) {
  const [enabled] = useShareHands();
  const start = useRef<GameState | null>(null);
  // Made only when a hand is sent: crypto.randomUUID exists only on https and localhost.
  const game = useRef('');
  useEffect(() => {
    if (state.phase === 'dealing' && state.dealt === 0) {
      if (state.handNumber === 1) game.current = '';
      start.current = state;
      return;
    }
    const s = start.current;
    if ((state.phase === 'handOver' || state.phase === 'gameOver') && s && s.handNumber === state.handNumber && s.config === state.config) {
      start.current = null;
      // Only 2-player hands for now: the ML bots are 2-player only.
      if (enabled && HANDS_URL && state.config.players === 2) {
        game.current ||= crypto.randomUUID();
        send({ record: recordHand(s, state), player: playerId(), game: game.current, bot: botIdFor(state.config), app: import.meta.env.VITE_APP_VERSION || 'dev' });
      }
    }
  }, [state, enabled]);
}
