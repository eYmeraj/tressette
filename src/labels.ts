import { GameConfig, Signal } from './engine/game';
import { Bot, botFor } from './engine/bots';

/** The opponent you face: Endi, at a later life stage the stronger the bot. */
export function endiName(bot: Bot): string {
  return `${bot.endisLifeStage} Endi`;
}

export function seatNames(config: GameConfig): string[] {
  const endi = endiName(botFor(config));
  return config.players === 4 ? ['You', endi, 'Giulia', 'Marco'] : ['You', endi];
}

export function teamNames(config: GameConfig): [string, string] {
  const endi = endiName(botFor(config));
  return config.players === 4 ? ['You & Giulia', `${endi} & Marco`] : ['You', endi];
}

export const SIGNALS: Record<Signal, { label: string; help: string }> = {
  busso: { label: 'Busso', help: 'Knock: take this trick with your best card and lead the suit back to me' },
  volo: { label: 'Volo', help: 'Fly: this is my last card of the suit' },
  striscio: { label: 'Striscio', help: 'Drag: I have more cards of this suit' },
};
