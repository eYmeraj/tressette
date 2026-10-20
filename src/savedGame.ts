import { GameState } from './engine/game';
import { read, remove, write } from './settings';

const KEY = 'tressette.savedGame';
/** Bump when GameState changes shape; saves from other versions are dropped instead of loaded. */
const VERSION = 1;

/** Reads a stored save, or null if it is missing, unreadable or from another version. */
export function parseSave(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const save = JSON.parse(raw);
    const state = save?.version === VERSION ? save.state : null;
    if (!state?.config || !Array.isArray(state.hands) || typeof state.phase !== 'string') return null;
    return { ...state, drawn: state.drawn ?? [] } as GameState;
  } catch {
    return null;
  }
}

export function serializeSave(state: GameState): string {
  return JSON.stringify({ version: VERSION, state });
}

export function loadSavedGame(): GameState | null {
  return parseSave(read(KEY));
}

export function saveGame(state: GameState) {
  write(KEY, serializeSave(state));
}

export function clearSavedGame() {
  remove(KEY);
}
