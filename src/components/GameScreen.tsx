import { useEffect, useState } from 'react';
import { AnimatePresence, Variants, motion } from 'framer-motion';
import { Card, sortHand } from '../engine/cards';
import { trickWinnerIndex } from '../engine/rules';
import {
  CompletedTrick, GameConfig, GameState, Signal, availableAccusi, canSignal, deckCards, legalMoves, teamOf, visibleHand,
} from '../engine/game';
import { HUMAN, useGame } from '../useGame';
import { SIGNALS, seatNames, teamNames } from '../labels';
import { CardView } from './Card';

type Position = 'bottom' | 'right' | 'top' | 'left';

function positions(config: GameConfig): Position[] {
  return config.players === 4 ? ['bottom', 'right', 'top', 'left'] : ['bottom', 'top'];
}

/** Where collected tricks fly off to, in multiples of the card's own size so it scales with --card-w. */
const TOWARDS: Record<Position, { x: string; y: string }> = {
  bottom: { x: '0%', y: '160%' },
  top: { x: '0%', y: '-160%' },
  left: { x: '-420%', y: '0%' },
  right: { x: '420%', y: '0%' },
};

const collectVariants: Variants = {
  exit: (to: { x: string; y: string }) => ({
    x: to.x,
    y: to.y,
    scale: 0.5,
    opacity: 0,
    transition: { duration: 0.5, ease: 'easeIn' },
  }),
};

export function GameScreen({ config, onQuit }: { config: GameConfig; onQuit: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bots and trick timers wait while the settings dialog is open.
  const game = useGame(config, settingsOpen);
  const { state } = game;
  // A signal choice belongs to one lead; picking it for an earlier trick or hand doesn't carry over.
  const leadKey = `${state.handNumber}:${state.tricks.length}`;
  const [picked, setPicked] = useState<{ signal: Signal; leadKey: string } | null>(null);

  const names = seatNames(config);
  const teams = teamNames(config);
  const pos = positions(config);

  const legal = new Set(legalMoves(state, HUMAN).map((c) => c.id));
  const myTurn = state.phase === 'playing' && state.turn === HUMAN;
  const accusi = availableAccusi(state, HUMAN);
  const signalling = canSignal(state, HUMAN);
  const signal = signalling && picked?.leadKey === leadKey ? picked.signal : null;
  const setSignal = (sig: Signal | null) => setPicked(sig && { signal: sig, leadKey });
  const lastTrick = state.tricks.at(-1);

  const play = (cardId: string) => {
    game.play(cardId, signal ?? undefined);
  };

  return (
    <div className="game">
      <section className="table">
        {pos.map((p, seat) =>
          seat === HUMAN ? null : (
            <Opponent key={seat} state={state} seat={seat} position={p} name={names[seat]} />
          ),
        )}

        <div className="center">
          <Deck cards={deckCards(state)} />
          <TrickArea state={state} positions={pos} lastTrick={lastTrick} />
        </div>

        <div className="seat seat-bottom">
          <div className="status">
            {state.phase === 'dealing'
              ? 'Dealing…'
              : state.phase === 'playing' &&
                (myTurn ? (
                  <strong>Your turn{state.trick.length === 0 ? ' — lead any card' : ''}</strong>
                ) : (
                  `${names[state.turn]} is thinking…`
                ))}
          </div>

          {accusi.length > 0 && (
            <div className="banner">
              You can declare {accusi.map((a) => `${a.label} (+${a.points})`).join(', ')}
              <button type="button" className="primary" onClick={game.declare}>
                Declare
              </button>
            </div>
          )}

          {signalling && (
            <div className="signals" role="group" aria-label="Signal to partner">
              {(Object.keys(SIGNALS) as Signal[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={signal === s ? 'chip active' : 'chip'}
                  title={SIGNALS[s].help}
                  onClick={() => setSignal(signal === s ? null : s)}
                >
                  {SIGNALS[s].label}
                </button>
              ))}
            </div>
          )}

          <div className="hand">
            {sortHand(visibleHand(state, HUMAN)).map((c) => (
              <CardView
                key={c.id}
                layoutId={c.id}
                card={c}
                onClick={() => play(c.id)}
                playable={myTurn && legal.has(c.id)}
                dimmed={myTurn && !legal.has(c.id)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="hud">
        <Scoreboard state={state} teams={teams} />
        <button
          type="button"
          className="icon-button"
          aria-label="Settings"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onQuit={onQuit} />}

      {(state.phase === 'handOver' || state.phase === 'gameOver') && (
        <HandSummary state={state} teams={teams} onNext={state.phase === 'handOver' ? game.nextHand : game.restart} />
      )}
    </div>
  );
}

function TrickArea({
  state,
  positions: pos,
  lastTrick,
}: {
  state: GameState;
  positions: Position[];
  lastTrick?: CompletedTrick;
}) {
  const winner = state.phase === 'trickComplete' ? trickWinnerIndex(state.trick.map((p) => p.card)) : -1;
  return (
    <div className="trick">
      <AnimatePresence custom={TOWARDS[pos[lastTrick?.winner ?? 0]]}>
        {state.trick.map((p, i) => (
          <motion.div
            key={p.card.id}
            className={`played played-${pos[p.seat]} ${i === winner ? 'winner' : ''}`}
            variants={collectVariants}
            exit="exit"
          >
            <CardView card={p.card} layoutId={p.card.id} />
            {p.signal && (
              <span className="signal-badge" title={SIGNALS[p.signal].help}>
                {SIGNALS[p.signal].label}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Face-down pile whose edge thins out as cards leave it. The top two cards carry layoutIds so they fly
 * to whoever receives them; the pile's thickness is drawn with stacked shadows on one base card.
 */
function Deck({ cards }: { cards: Card[] }) {
  if (!cards.length) return null;
  const edge = Array.from(
    { length: Math.ceil(cards.length / 2) },
    (_, i) => `${(i + 1) * 0.4}px ${(i + 1) * 0.8}px 0 ${i % 3 === 2 ? '#b9ad8f' : '#efe6cf'}`,
  ).join(', ');
  return (
    <div className="deck">
      <div className="deck-stack">
        <CardView faceDown style={{ boxShadow: edge }} />
        {cards
          .slice(0, 2)
          .reverse()
          .map((c) => (
            <CardView key={c.id} layoutId={c.id} faceDown className="deck-top" />
          ))}
      </div>
      <span className="deck-count" aria-label={`${cards.length} cards left in the deck`}>
        {cards.length}
      </span>
    </div>
  );
}

function Opponent({
  state,
  seat,
  position,
  name,
}: {
  state: GameState;
  seat: number;
  position: Position;
  name: string;
}) {
  const active = state.phase === 'playing' && state.turn === seat;
  const partner = state.config.players === 4 && teamOf(state.config, seat) === teamOf(state.config, HUMAN);
  return (
    <div className={`seat seat-${position}`}>
      <div className={`nameplate ${active ? 'active' : ''} team-${teamOf(state.config, seat)}`}>
        {name}
        {partner && <small> (partner)</small>}
      </div>
      <div className={`backs ${position === 'left' || position === 'right' ? 'vertical' : ''}`}>
        {visibleHand(state, seat).map((c) => (
          <CardView key={c.id} layoutId={c.id} faceDown className="small" />
        ))}
      </div>
    </div>
  );
}

function Scoreboard({ state, teams }: { state: GameState; teams: [string, string] }) {
  return (
    <div className="scoreboard" aria-label="Score">
      {teams.map((t, i) => (
        <div key={t} className={`score-row team-${i}`}>
          <span>{t}</span>
          <strong>{state.scores[i]}</strong>
        </div>
      ))}
      <div className="score-meta">
        Hand {state.handNumber} · to {state.config.targetScore}
      </div>
    </div>
  );
}

function Settings({ onClose, onQuit }: { onClose: () => void; onQuit: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="modal settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title">Settings</h2>
        <p>The game is paused.</p>
        <div className="modal-actions">
          <button type="button" className="danger" onClick={onQuit}>
            Quit game
          </button>
          <button type="button" className="primary" onClick={onClose} autoFocus>
            Resume
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function HandSummary({ state, teams, onNext }: { state: GameState; teams: [string, string]; onNext: () => void }) {
  const r = state.handResult!;
  const over = state.phase === 'gameOver';
  return (
    <div className="modal-backdrop">
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
      >
        <h2>{over ? `${teams[state.winner!]} ${state.winner === 0 ? 'win' : 'wins'}!` : `Hand ${state.handNumber} finished`}</h2>
        <table>
          <thead>
            <tr>
              <th />
              <th>{teams[0]}</th>
              <th>{teams[1]}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cards</td>
              {[0, 1].map((t) => (
                <td key={t}>
                  {r.points[t] - r.accusiPoints[t]}
                  {r.lastTrickTeam === t && <small> (incl. last trick)</small>}
                </td>
              ))}
            </tr>
            <tr>
              <td>Accusi</td>
              {[0, 1].map((t) => (
                <td key={t}>{r.accusiPoints[t]}</td>
              ))}
            </tr>
            <tr className="total">
              <td>This hand</td>
              {[0, 1].map((t) => (
                <td key={t}>+{r.points[t]}</td>
              ))}
            </tr>
            <tr className="total">
              <td>Match</td>
              {[0, 1].map((t) => (
                <td key={t}>{state.scores[t]}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <button type="button" className="primary" onClick={onNext} autoFocus>
          {over ? 'Play again' : 'Next hand'}
        </button>
      </motion.div>
    </div>
  );
}
