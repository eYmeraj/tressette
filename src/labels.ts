import { SUIT_NAMES, cardName } from './engine/cards';
import { GameConfig, GameEvent, Signal } from './engine/game';

export function seatNames(config: GameConfig): string[] {
  return config.players === 4 ? ['You', 'Luca', 'Giulia', 'Marco'] : ['You', 'Luca'];
}

export function teamNames(config: GameConfig): [string, string] {
  return config.players === 4 ? ['You & Giulia', 'Luca & Marco'] : ['You', 'Luca'];
}

export const SIGNALS: Record<Signal, { label: string; help: string }> = {
  busso: { label: 'Busso', help: 'Knock: take this trick with your best card and lead the suit back to me' },
  volo: { label: 'Volo', help: 'Fly: this is my last card of the suit' },
  striscio: { label: 'Striscio', help: 'Drag: I have more cards of this suit' },
};

export function formatThirds(t: number): string {
  const whole = Math.floor(t / 3);
  const frac = ['', '⅓', '⅔'][t % 3];
  if (!whole && !frac) return '0';
  return `${whole || ''}${frac}`;
}

export function describeEvent(e: GameEvent, names: string[], teams: [string, string]): string {
  switch (e.type) {
    case 'declare':
      return `${names[e.seat]} declared ${e.accusi.map((a) => `${a.label} (+${a.points})`).join(', ')}`;
    case 'signal':
      return `${names[e.seat]} signalled ${SIGNALS[e.signal].label} in ${SUIT_NAMES[e.suit]}`;
    case 'trick':
      return `${names[e.winner]} took the trick (${formatThirds(e.thirds)} pts)`;
    case 'draw':
      return `${names[e.seat]} drew the ${cardName(e.card)}`;
    case 'hand':
      return `Hand over — ${teams[0]} +${e.result.points[0]}, ${teams[1]} +${e.result.points[1]}`;
  }
}
