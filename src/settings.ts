/// localStorage that never throws, and the player's on/off settings kept in it. Storage can be unavailable (private
/// mode, blocked site data); then nothing is remembered and every setting keeps its default.
import { useSyncExternalStore } from 'react';

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}

/**
 * An on/off setting saved under `key` (as 'on' or 'off'; `fallback` until the player chooses), kept in step across
 * every component that shows it. `onSet` runs whenever the player changes it.
 */
export function storedFlag(key: string, fallback: boolean, onSet?: (on: boolean) => void) {
  const saved = read(key);
  let on = saved === null ? fallback : saved === 'on';
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  const set = (value: boolean) => {
    on = value;
    write(key, value ? 'on' : 'off');
    onSet?.(value);
    listeners.forEach((l) => l());
  };
  return {
    get: () => on,
    set,
    use: (): [boolean, (on: boolean) => void] => [useSyncExternalStore(subscribe, () => on), set],
  };
}
