/// Runs bot moves off the main thread so the table keeps animating while a bot thinks.
import { BOTS, prepareBot } from './engine/bots';
import type { BotRequest, BotReply } from './botClient';

self.onmessage = async (e: MessageEvent<BotRequest>) => {
  const { id, botId, view } = e.data;
  await prepareBot(botId);
  const reply: BotReply = { id, move: BOTS[botId].chooseMove(view, Math.random) };
  (self as unknown as { postMessage(message: BotReply): void }).postMessage(reply);
};
