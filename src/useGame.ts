import { useCallback, useEffect, useState } from 'react';
import { chooseMove } from './engine/bot';
import {
  GameConfig, GameState, Signal, collectTrick, declare, newGame, nextHand, playCard,
} from './engine/game';

export const HUMAN = 0;
const BOT_DELAY_MS = 750;
const TRICK_PAUSE_MS = 1400;

function botStep(s: GameState): GameState {
  if (s.phase !== 'playing' || s.turn === HUMAN) return s;
  const seat = s.turn;
  const move = chooseMove(s, seat);
  const declared = move.declare ? declare(s, seat) : s;
  return playCard(declared, seat, move.cardId, move.signal);
}

/** Holds the game state and drives the bots and trick pauses on timers. */
export function useGame(config: GameConfig) {
  const [state, setState] = useState(() => newGame(config));

  useEffect(() => {
    let timer: number | undefined;
    if (state.phase === 'trickComplete') {
      timer = window.setTimeout(() => setState(collectTrick), TRICK_PAUSE_MS);
    } else if (state.phase === 'playing' && state.turn !== HUMAN) {
      timer = window.setTimeout(() => setState(botStep), BOT_DELAY_MS);
    }
    return () => window.clearTimeout(timer);
  }, [state]);

  return {
    state,
    play: useCallback((cardId: string, signal?: Signal) => setState((s) => playCard(s, HUMAN, cardId, signal)), []),
    declare: useCallback(() => setState((s) => declare(s, HUMAN)), []),
    nextHand: useCallback(() => setState((s) => nextHand(s)), []),
    restart: useCallback(() => setState(newGame(config)), [config]),
  };
}
