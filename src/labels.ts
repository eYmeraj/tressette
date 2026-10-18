import { GameConfig, Signal } from './engine/game';

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
