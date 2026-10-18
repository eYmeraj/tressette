import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { chooseMove } from './engine/bot';
import {
  GameConfig, GameState, Signal, collectTrick, dealNext, declare, newGame, nextHand, playCard,
} from './engine/game';

export const HUMAN = 0;
const BOT_DELAY_MS = 800;
const TRICK_PAUSE_MS = 1400;
const DEAL_STEP_MS = 70;

function dealAll(s: GameState): GameState {
  while (s.phase === 'dealing') s = dealNext(s);
  return s;
}

function botStep(s: GameState): GameState {
  if (s.phase !== 'playing' || s.turn === HUMAN) return s;
  const seat = s.turn;
  const move = chooseMove(s, seat);
  const declared = move.declare ? declare(s, seat) : s;
  return playCard(declared, seat, move.cardId, move.signal);
}

/** Holds the game state and paces the deal, the bots and trick pauses on timers. */
export function useGame(config: GameConfig, paused = false) {
  const [state, setState] = useState(() => newGame(config));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let timer: number | undefined;
    if (paused) return;
    if (state.phase === 'dealing') {
      // Without the animation there is nothing to watch, so deal the whole hand at once.
      timer = window.setTimeout(() => setState(reducedMotion ? dealAll : dealNext), reducedMotion ? 0 : DEAL_STEP_MS);
    } else if (state.phase === 'trickComplete') {
      timer = window.setTimeout(() => setState(collectTrick), TRICK_PAUSE_MS);
    } else if (state.phase === 'playing' && state.turn !== HUMAN) {
      timer = window.setTimeout(() => setState(botStep), BOT_DELAY_MS);
    }
    return () => window.clearTimeout(timer);
  }, [state, reducedMotion, paused]);

  return {
    state,
    play: useCallback((cardId: string, signal?: Signal) => setState((s) => playCard(s, HUMAN, cardId, signal)), []),
    declare: useCallback(() => setState((s) => declare(s, HUMAN)), []),
    nextHand: useCallback(() => setState((s) => nextHand(s)), []),
    restart: useCallback(() => setState(newGame(config)), [config]),
  };
}
