import { useState } from 'react';
import { sortHand } from '../engine/cards';
import { trickWinnerIndex } from '../engine/rules';
import { GameConfig, GameState, Signal, availableAccusi, canSignal, legalMoves, teamOf } from '../engine/game';
import { HUMAN, useGame } from '../useGame';
import { SIGNALS, describeEvent, seatNames, teamNames } from '../labels';
import { CardView } from './Card';

type Position = 'bottom' | 'right' | 'top' | 'left';

function positions(config: GameConfig): Position[] {
  return config.players === 4 ? ['bottom', 'right', 'top', 'left'] : ['bottom', 'top'];
}

export function GameScreen({ config, onQuit }: { config: GameConfig; onQuit: () => void }) {
  const game = useGame(config);
  const { state } = game;
  const [signal, setSignal] = useState<Signal | null>(null);

  const names = seatNames(config);
  const teams = teamNames(config);
  const pos = positions(config);
  const legal = new Set(legalMoves(state, HUMAN).map((c) => c.id));
  const myTurn = state.phase === 'playing' && state.turn === HUMAN;
  const accusi = availableAccusi(state, HUMAN);
  const signalling = canSignal(state, HUMAN);

  const play = (cardId: string) => {
    game.play(cardId, signalling ? signal ?? undefined : undefined);
    setSignal(null);
  };

  return (
    <div className="game">
      <section className="table">
        {pos.map((p, seat) =>
          seat === HUMAN ? null : (
            <Opponent key={seat} state={state} seat={seat} position={p} name={names[seat]} />
          ),
        )}

        <TrickArea state={state} positions={pos} />

        <div className="seat seat-bottom">
          <div className="status">
            {state.phase === 'playing' &&
              (myTurn ? <strong>Your turn{state.trick.length === 0 ? ' — lead any card' : ''}</strong> : `${names[state.turn]} is thinking…`)}
          </div>

          {accusi.length > 0 && (
            <div className="banner">
              You can declare {accusi.map((a) => `${a.label} (+${a.points})`).join(', ')}
              <button type="button" className="primary" onClick={game.declare}>Declare</button>
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
            {sortHand(state.hands[HUMAN]).map((c) => (
              <CardView
                key={c.id}
                card={c}
                onClick={() => play(c.id)}
                playable={myTurn && legal.has(c.id)}
                dimmed={myTurn && !legal.has(c.id)}
              />
            ))}
          </div>
        </div>
      </section>

      <aside className="sidebar">
        <div className="scores">
          {teams.map((t, i) => (
            <div key={t} className={`score team-${i}`}>
              <span>{t}</span>
              <strong>{state.scores[i]}</strong>
            </div>
          ))}
          <div className="meta">
            Hand {state.handNumber} · playing to {config.targetScore}
            {config.players === 2 && ` · ${state.stock.length} cards in deck`}
          </div>
        </div>

        <LastTrick state={state} names={names} />

        <ol className="log" reversed>
          {[...state.events].reverse().map((e, i) => (
            <li key={state.events.length - i}>{describeEvent(e, names, teams)}</li>
          ))}
        </ol>

        <button type="button" onClick={onQuit}>New game</button>
      </aside>

      {(state.phase === 'handOver' || state.phase === 'gameOver') && (
        <HandSummary state={state} teams={teams} onNext={state.phase === 'handOver' ? game.nextHand : onQuit} />
      )}
    </div>
  );
}

function Opponent({ state, seat, position, name }: { state: GameState; seat: number; position: Position; name: string }) {
  const active = state.phase === 'playing' && state.turn === seat;
  const partner = state.config.players === 4 && teamOf(state.config, seat) === teamOf(state.config, HUMAN);
  return (
    <div className={`seat seat-${position}`}>
      <div className={`nameplate ${active ? 'active' : ''} team-${teamOf(state.config, seat)}`}>
        {name}
        {partner && <small> (partner)</small>}
      </div>
      <div className={`backs ${position === 'left' || position === 'right' ? 'vertical' : ''}`}>
        {state.hands[seat].map((c) => (
          <CardView key={c.id} faceDown className="small" />
        ))}
      </div>
    </div>
  );
}

function TrickArea({ state, positions: pos }: { state: GameState; positions: Position[] }) {
  const winner = state.phase === 'trickComplete' ? trickWinnerIndex(state.trick.map((p) => p.card)) : -1;
  return (
    <div className="trick">
      {state.trick.map((p, i) => (
        <div key={p.card.id} className={`played played-${pos[p.seat]} ${i === winner ? 'winner' : ''}`}>
          <CardView card={p.card} />
          {p.signal && <span className="signal-badge" title={SIGNALS[p.signal].help}>{SIGNALS[p.signal].label}</span>}
        </div>
      ))}
    </div>
  );
}

function LastTrick({ state, names }: { state: GameState; names: string[] }) {
  const last = state.tricks[state.tricks.length - 1];
  if (!last) return null;
  return (
    <div className="last-trick">
      <h3>Last trick — {names[last.winner]}</h3>
      <div className="mini-cards">
        {last.plays.map((p) => (
          <CardView key={p.card.id} card={p.card} className="mini" />
        ))}
      </div>
    </div>
  );
}

function HandSummary({ state, teams, onNext }: { state: GameState; teams: [string, string]; onNext: () => void }) {
  const r = state.handResult!;
  const over = state.phase === 'gameOver';
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
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
                <td key={t}>{r.points[t] - r.accusiPoints[t]}{r.lastTrickTeam === t && <small> (incl. last trick)</small>}</td>
              ))}
            </tr>
            <tr>
              <td>Accusi</td>
              {[0, 1].map((t) => <td key={t}>{r.accusiPoints[t]}</td>)}
            </tr>
            <tr className="total">
              <td>This hand</td>
              {[0, 1].map((t) => <td key={t}>+{r.points[t]}</td>)}
            </tr>
            <tr className="total">
              <td>Match</td>
              {[0, 1].map((t) => <td key={t}>{state.scores[t]}</td>)}
            </tr>
          </tbody>
        </table>
        <button type="button" className="primary" onClick={onNext} autoFocus>
          {over ? 'Play again' : 'Next hand'}
        </button>
      </div>
    </div>
  );
}
