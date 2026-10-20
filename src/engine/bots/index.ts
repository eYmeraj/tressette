import { GameConfig, GameState, Rng } from '../game';
import { seatView } from '../view';
import { classicMove } from './classic';
import { makeStatsBot } from './stats';
import { makeNetSearchBot, makeNeuralBot } from './neural';
import type { MlpWeights } from '../ml/mlp';
// Loaded only when a network bot first plays (see prepareBot), so the page doesn't parse megabytes of weights for
// players who never choose one. (The service worker still downloads the file for offline play: vite.config.ts.)
import weightsUrl from '../ml/weights-2p.json?url';
import { Bot, BotMove, Player, applyMove } from './types';

export type { Bot, BotMove, Player } from './types';
export { applyMove } from './types';

const fetched = new Map<string, Promise<MlpWeights>>();

/** Downloads weights once per URL, however many bots use them. A failed download is forgotten, so the next call retries. */
function fetchWeights(url: string): Promise<MlpWeights> {
  if (!fetched.has(url)) {
    const weights: Promise<MlpWeights> = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Couldn't load ${url}: ${res.status}`);
      return res.json();
    });
    weights.catch(() => fetched.delete(url));
    fetched.set(url, weights);
  }
  return fetched.get(url)!;
}

const loaders = new Map<string, () => Promise<void>>();

/** A bot whose real implementation is built asynchronously (downloading weights) by `prepareBot`. */
function lazyBot(meta: Omit<Bot, 'chooseMove'>, load: () => Promise<Player>): Bot {
  let impl: Player | null = null;
  let loading: Promise<void> | null = null;
  loaders.set(meta.id, () =>
    (loading ??= load().then(
      (b) => void (impl = b),
      (e) => {
        loading = null; // try again next time
        throw e;
      },
    )));
  return {
    ...meta,
    chooseMove(v, rng): BotMove {
      if (!impl) throw new Error(`${meta.id} isn't loaded yet: await prepareBot('${meta.id}') first`);
      return impl.chooseMove(v, rng);
    },
  };
}

/** Every opponent the player can choose, in the order the setup screen lists them. */
export const BOTS = {
  classic: {
    id: 'classic',
    label: 'Easy',
    endisLifeStage: 'Baby Casino',
    description: 'Plays by simple rules of thumb.',
    chooseMove: classicMove,
  },
  'stats-medium': {
    id: 'stats-medium',
    label: 'Medium',
    endisLifeStage: 'Cat Costume',
    description: 'Imagines a few dozen ways the hidden cards could lie and plays what works best.',
    chooseMove: makeStatsBot({ samples: 24, endgame: false }),
  },
  'stats-hard': {
    id: 'stats-hard',
    label: 'Hard',
    endisLifeStage: 'Chubby',
    description: 'Weighs hundreds of possible deals, and plays the 2-player endgame perfectly.',
    chooseMove: makeStatsBot({ samples: 120, endgame: true }),
  },
  // Trained by self-play (see ml/README.md); 2-player only, and they need prepareBot before their first move.
  neural: lazyBot(
    { id: 'neural', label: 'Expert', endisLifeStage: 'Uni', players: [2],
      description: 'Learned by playing itself for thousands of hands: plays on instinct, instantly. 2 players only.' },
    async () => makeNeuralBot(await fetchWeights(weightsUrl), 'neural'),
  ),
  expert: lazyBot(
    { id: 'expert', label: 'Master', endisLifeStage: 'Habibi', players: [2],
      description: 'Plays on instinct too, then imagines how the hidden cards could lie and checks its choice. 2 players only.' },
    // About 0.3 s a move on a desktop, at most ~0.8 s on slow devices.
    async () => makeNetSearchBot(await fetchWeights(weightsUrl), { samples: 40, top: 3, budget: { ms: 800, minSamples: 12 } }, 'expert'),
  ),
} satisfies Record<string, Bot>;

export type BotId = keyof typeof BOTS;

/** Gets a bot ready to play: downloads a network bot's weights the first time; instant for the others. */
export function prepareBot(id: BotId): Promise<void> {
  return loaders.get(id)?.() ?? Promise.resolve();
}

export const DEFAULT_BOT: BotId = 'classic';

/** Whether `bot` can play a game of `players`. */
export function botPlays(bot: Bot, players: 2 | 4): boolean {
  return !bot.players || bot.players.includes(players);
}

/** The bot a game uses; games saved before bots were selectable (or with a retired bot, or one that can't play
 * this many players) get the default. */
export function botIdFor(config: GameConfig): BotId {
  return config.bot && config.bot in BOTS && botPlays(BOTS[config.bot], config.players) ? config.bot : DEFAULT_BOT;
}

export function botFor(config: GameConfig): Bot {
  return BOTS[botIdFor(config)];
}

/** Lets `bot` take the current seat's turn. */
export function applyBotMove(s: GameState, bot: Player, rng: Rng = Math.random): GameState {
  return applyMove(s, s.turn, bot.chooseMove(seatView(s, s.turn), rng));
}
