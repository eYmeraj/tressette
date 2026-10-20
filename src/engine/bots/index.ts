import { GameConfig, GameState, Rng } from '../game';
import { seatView } from '../view';
import { classicMove } from './classic';
import { makeStatsBot } from './stats';
import { makeNetSearchBot, makeNeuralBot } from './neural';
import type { MlpWeights } from '../ml/mlp';
// Fetched only when a network bot first plays (see prepareBot), so the page doesn't download megabytes of weights
// for players who never choose one.
import weightsUrl from '../ml/weights-2p.json?url';
import { Bot, BotMove, applyMove } from './types';

export type { Bot, BotMove } from './types';
export { applyMove } from './types';

const fetched = new Map<string, Promise<MlpWeights>>();

/** Downloads weights once per URL, however many bots use them. */
function fetchWeights(url: string): Promise<MlpWeights> {
  if (!fetched.has(url)) {
    fetched.set(url, fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Couldn't load ${url}: ${res.status}`);
      return res.json();
    }));
  }
  return fetched.get(url)!;
}

const loaders = new Map<string, () => Promise<void>>();

/** A bot whose real implementation is built asynchronously (downloading weights) by `prepareBot`. */
function lazyBot(meta: Omit<Bot, 'chooseMove'>, load: () => Promise<Bot>): Bot {
  let impl: Bot | null = null;
  let loading: Promise<void> | null = null;
  loaders.set(meta.id, () => (loading ??= load().then((b) => void (impl = b))));
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
    name: 'Classic',
    label: 'Easy',
    endisLifeStage: 'Baby Casino',
    difficulty: 'Easy',
    description: 'Plays by simple rules of thumb.',
    chooseMove: classicMove,
  },
  'stats-medium': {
    id: 'stats-medium',
    name: 'Stats',
    label: 'Medium',
    endisLifeStage: 'Cat Costume',
    difficulty: 'Medium',
    description: 'Imagines a few dozen ways the hidden cards could lie and plays what works best.',
    chooseMove: makeStatsBot({ samples: 24, endgame: false }),
  },
  'stats-hard': {
    id: 'stats-hard',
    name: 'Stats',
    label: 'Hard',
    endisLifeStage: 'Chubby',
    difficulty: 'Hard',
    description: 'Weighs hundreds of possible deals, and plays the 2-player endgame perfectly.',
    chooseMove: makeStatsBot({ samples: 120, endgame: true }),
  },
  // Trained by self-play (see ml/README.md); 2-player only, and they need prepareBot before their first move.
  neural: lazyBot(
    { id: 'neural', name: 'Neural', label: 'Expert', endisLifeStage: 'Uni', difficulty: 'Expert', players: [2],
      description: 'Learned by playing itself for thousands of hands: plays on instinct, instantly. 2 players only.' },
    async () => makeNeuralBot(await fetchWeights(weightsUrl), 'neural'),
  ),
  expert: lazyBot(
    { id: 'expert', name: 'Expert', label: 'Master', endisLifeStage: 'Habibi', difficulty: 'Master', players: [2],
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
export function applyBotMove(s: GameState, bot: Bot, rng: Rng = Math.random): GameState {
  return applyMove(s, s.turn, bot.chooseMove(seatView(s, s.turn), rng));
}
