/// Runs bot moves off the main thread so the table keeps animating while a bot thinks.
import { BOTS } from './engine/bots';
import type { BotRequest, BotReply } from './botClient';

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const { id, botId, view } = e.data;
  const reply: BotReply = { id, move: BOTS[botId].chooseMove(view, Math.random) };
  (self as unknown as { postMessage(message: BotReply): void }).postMessage(reply);
};
