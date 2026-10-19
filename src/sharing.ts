/// Sharing finished hands (opt-in) to help train the bots. Sends only the cards and plays, an anonymous random id,
/// and which bot was played; never anything about the person. The setup screen explains it ("Sharing hands").
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { GameState } from './engine/game';
import { HandRecord, recordHand } from './engine/record';
import { botIdFor } from './engine/bots';

/** Where hands are sent (the Cloudflare Worker in worker/); without it the option isn't offered at all. */
export const HANDS_URL: string | undefined = import.meta.env.VITE_HANDS_URL || undefined;
const KEY = 'tressette.shareHands';
const PLAYER_KEY = 'tressette.playerId';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}

let on = read(KEY) === 'on';
const listeners = new Set<() => void>();

export function useShareHands(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
  );
  return [
    value,
    (v: boolean) => {
      on = v;
      write(KEY, v ? 'on' : 'off');
      listeners.forEach((l) => l());
    },
  ];
}

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

function send(hand: SharedHand) {
  if (!HANDS_URL) return;
  // keepalive: still delivered if the page is closing right after the hand.
  void fetch(`${HANDS_URL}/hands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(hand),
    keepalive: true,
  }).catch(() => {
    // Sharing is best effort: a lost hand doesn't matter.
  });
}

/**
 * Records each hand from its deal to its end and, if the player opted in, shares it. Hands resumed from a saved game
 * part-way through aren't shared, since their deal wasn't seen.
 */
export function useHandSharing(state: GameState) {
  const [enabled] = useShareHands();
  const start = useRef<GameState | null>(null);
  const game = useRef(crypto.randomUUID());
  useEffect(() => {
    if (state.phase === 'dealing' && state.dealt === 0) {
      if (state.handNumber === 1) game.current = crypto.randomUUID();
      start.current = state;
      return;
    }
    const s = start.current;
    if ((state.phase === 'handOver' || state.phase === 'gameOver') && s && s.handNumber === state.handNumber && s.config === state.config) {
      start.current = null;
      if (enabled && HANDS_URL) {
        send({ record: recordHand(s, state), player: playerId(), game: game.current, bot: botIdFor(state.config), app: import.meta.env.VITE_APP_VERSION || 'dev' });
      }
    }
  }, [state, enabled]);
}
