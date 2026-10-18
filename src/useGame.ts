import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { applyMove, botIdFor } from './engine/bots';
import { seatView } from './engine/view';
import { requestBotMove } from './botClient';
import {
  GameState, Signal, callAccusi, collectTrick, dealNext, finishDraw, newGame, nextHand, playCard,
} from './engine/game';

export const HUMAN = 0;
const BOT_DELAY_MS = 800;
const TRICK_PAUSE_MS = 1400;
const DEAL_STEP_MS = 70;
/** How long drawn cards stay face up beside the deck before joining the hands. */
const DRAW_SHOW_MS = 1300;

function dealAll(s: GameState): GameState {
  while (s.phase === 'dealing') s = dealNext(s);
  return s;
}

/**
 * Holds the game state, starting from `start` (a new deal or a saved game), and paces the deal, the bots and
 * trick pauses on timers. `paused` stops everything; `holdTrick` keeps a completed trick on the table for as
 * long as it returns true.
 */
export function useGame(start: GameState, paused = false, holdTrick?: (s: GameState) => boolean) {
  const [state, setState] = useState(start);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let timer: number | undefined;
    if (paused) return;
    if (state.phase === 'dealing') {
      // Without the animation there is nothing to watch, so deal the whole hand at once.
      timer = window.setTimeout(() => setState(reducedMotion ? dealAll : dealNext), reducedMotion ? 0 : DEAL_STEP_MS);
    } else if (state.phase === 'trickComplete') {
      if (holdTrick?.(state)) return;
      timer = window.setTimeout(() => setState(collectTrick), TRICK_PAUSE_MS);
    } else if (state.phase === 'drawing') {
      timer = window.setTimeout(() => setState(finishDraw), DRAW_SHOW_MS);
    } else if (state.phase === 'playing' && state.turn !== HUMAN) {
      // The bot thinks (in a worker) while the delay runs; its move lands no sooner than BOT_DELAY_MS.
      let cancelled = false;
      const seat = state.turn;
      const started = performance.now();
      requestBotMove(botIdFor(state.config), seatView(state, seat)).then((move) => {
        if (cancelled) return;
        const wait = Math.max(0, BOT_DELAY_MS - (performance.now() - started));
        timer = window.setTimeout(() => setState((s) => (s === state ? applyMove(s, seat, move) : s)), wait);
      });
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    return () => window.clearTimeout(timer);
  }, [state, reducedMotion, paused, holdTrick]);

  return {
    state,
    play: useCallback((cardId: string, signal?: Signal) => setState((s) => playCard(s, HUMAN, cardId, signal)), []),
    callAccusi: useCallback(() => setState((s) => callAccusi(s, HUMAN)), []),
    nextHand: useCallback(() => setState((s) => nextHand(s)), []),
    restart: useCallback(() => setState((s) => newGame(s.config)), []),
  };
}
