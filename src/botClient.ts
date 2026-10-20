import { BOTS, BotId, BotMove, prepareBot } from './engine/bots';
import { SeatView } from './engine/view';

export interface BotRequest {
  id: number;
  botId: BotId;
  view: SeatView;
}

export type BotReply = { id: number; move: BotMove; error?: undefined } | { id: number; error: string };

interface Pending {
  request: BotRequest;
  resolve: (move: BotMove) => void;
  reject: (error: Error) => void;
}

const pending = new Map<number, Pending>();
let nextId = 0;
let worker: Worker | null | undefined;

const thinkHere = async ({ botId, view }: BotRequest) => {
  await prepareBot(botId);
  return BOTS[botId].chooseMove(view, Math.random);
};

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<BotReply>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.error === undefined) p?.resolve(e.data.move);
      else p?.reject(new Error(e.data.error));
    };
    // If the worker can't run, answer everything still waiting on the main thread from now on.
    worker.onerror = () => {
      worker = null;
      for (const { request, resolve, reject } of pending.values()) thinkHere(request).then(resolve, reject);
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Asks a bot for its move, in a background worker when the browser supports it. Rejects if the bot can't move
 * (e.g. its weights didn't download); asking again retries. */
export function requestBotMove(botId: BotId, view: SeatView): Promise<BotMove> {
  const request: BotRequest = { id: nextId++, botId, view };
  const w = getWorker();
  if (!w) return thinkHere(request);
  return new Promise((resolve, reject) => {
    pending.set(request.id, { request, resolve, reject });
    w.postMessage(request);
  });
}
