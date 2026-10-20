/// Runs bot moves off the main thread so the table keeps animating while a bot thinks.
import { BOTS, prepareBot } from './engine/bots';
import type { BotRequest, BotReply } from './botClient';

self.onmessage = async (e: MessageEvent<BotRequest>) => {
  const { id, botId, view } = e.data;
  let reply: BotReply;
  try {
    await prepareBot(botId);
    reply = { id, move: BOTS[botId].chooseMove(view, Math.random) };
  } catch (err) {
    // Always answer: a request left unanswered would freeze the table.
    reply = { id, error: String(err) };
  }
  (self as unknown as { postMessage(message: BotReply): void }).postMessage(reply);
};
