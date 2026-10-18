import { GameState } from './engine/game';

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

// Storage can be unavailable (private mode, blocked site data); then games just aren't remembered.

export function loadSavedGame(): GameState | null {
  try {
    return parseSave(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveGame(state: GameState) {
  try {
    localStorage.setItem(KEY, serializeSave(state));
  } catch {
    // Not remembering the game is fine.
  }
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
