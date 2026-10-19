import { BOTS, BotId, BotMove, prepareBot } from './engine/bots';
import { SeatView } from './engine/view';

export interface BotRequest {
  id: number;
  botId: BotId;
  view: SeatView;
}

export interface BotReply {
  id: number;
  move: BotMove;
}

const pending = new Map<number, { request: BotRequest; resolve: (move: BotMove) => void }>();
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
      pending.get(e.data.id)?.resolve(e.data.move);
      pending.delete(e.data.id);
    };
    // If the worker can't run, answer everything still waiting on the main thread from now on.
    worker.onerror = () => {
      worker = null;
      for (const { request, resolve } of pending.values()) void thinkHere(request).then(resolve);
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Asks a bot for its move, in a background worker when the browser supports it. */
export function requestBotMove(botId: BotId, view: SeatView): Promise<BotMove> {
  const request: BotRequest = { id: nextId++, botId, view };
  const w = getWorker();
  if (!w) return thinkHere(request);
  return new Promise((resolve) => {
    pending.set(request.id, { request, resolve });
    w.postMessage(request);
  });
}
