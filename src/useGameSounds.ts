import { useEffect, useRef } from 'react';
import { GameState, teamOf } from './engine/game';
import { HUMAN } from './useGame';
import { sounds } from './sounds';

/** Plays a sound for each thing that happens at the table, by comparing each game state with the one before. */
export function useGameSounds(state: GameState) {
  const prev = useRef<GameState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    // Nothing for the state a game opens (or resumes) on.
    if (!p || p.config !== state.config) return;
    const ours = teamOf(state.config, HUMAN);

    if (state.phase === 'dealing' && state.dealt > p.dealt) sounds.deal();
    if (state.trick.length > p.trick.length) sounds.play();
    if (state.handNumber === p.handNumber && state.tricks.length > p.tricks.length) {
      sounds.collect(teamOf(state.config, state.tricks[state.tricks.length - 1].winner) === ours);
    }
    if (state.phase === 'drawing' && p.phase !== 'drawing') sounds.draw();
    if (state.handNumber === p.handNumber && state.events.length > p.events.length) {
      if (state.events.slice(p.events.length).some((e) => e.type === 'accuso' || e.type === 'signal')) sounds.announce();
    }
    if (state.phase === 'gameOver' && p.phase !== 'gameOver') sounds.game(state.winner === ours);
    else if (state.phase === 'handOver' && p.phase !== 'handOver') {
      const pts = state.handResult!.points;
      sounds.hand(pts[ours] >= pts[1 - ours]);
    }
  }, [state]);
}
