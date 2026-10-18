import { useState } from 'react';
import { SUITS, makeCard } from '../engine/cards';
import { GameConfig, GameState } from '../engine/game';
import { BOTS, BotId, DEFAULT_BOT, botFor } from '../engine/bots';
import { teamNames } from '../labels';
import { CardArt, CardView } from './Card';
import { CardArtPicker } from './CardArtPicker';
import { CoffeeStain } from './CoffeeStain';

const PREVIEW = SUITS.map((suit) => makeCard(suit, 1));

export function Setup({
  art,
  onArtChange,
  saved,
  onContinue,
  onStart,
  assoEffects,
  onAssoEffectsChange,
}: {
  art: CardArt;
  /** Omitted while the card-style choice is parked. */
  onArtChange?: (art: CardArt) => void;
  /** A game left unfinished last time, offered to continue. */
  saved: GameState | null;
  onContinue: (game: GameState) => void;
  onStart: (config: GameConfig) => void;
  assoEffects: boolean;
  onAssoEffectsChange: (on: boolean) => void;
}) {
  const [players, setPlayers] = useState<2 | 4>(2);
  const [targetScore, setTarget] = useState(31);
  const [accusi, setAccusi] = useState(false);
  const [signals, setSignals] = useState(true);
  const [bot, setBot] = useState<BotId>(DEFAULT_BOT);

  return (
    <div className="setup-page">
      <CoffeeStain />
      <main className="setup">
        <h1>Tressette</h1>
        <div className="setup-cards">
          {PREVIEW.map((c) => (
            <CardView key={c.id} card={c} />
          ))}
        </div>

        {saved && <ContinueGame saved={saved} onContinue={() => onContinue(saved)} />}

        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            onStart({ players, targetScore, accusi, signals: players === 4 && signals, bot });
          }}
        >
          <fieldset>
            <legend>Players</legend>
            <label>
              <input type="radio" name="players" checked={players === 2} onChange={() => setPlayers(2)} /> 2 players — head to head, drawing from the deck
            </label>
            <label>
              <input type="radio" name="players" checked={players === 4} onChange={() => setPlayers(4)} /> 4 players — you and Giulia vs two bots
            </label>
          </fieldset>

          <fieldset>
            <legend>Play to</legend>
            {[21, 31, 41].map((t) => (
              <label key={t} className="inline">
                <input type="radio" name="target" checked={targetScore === t} onChange={() => setTarget(t)} /> {t}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Opponents</legend>
            {(Object.keys(BOTS) as BotId[]).map((id) => (
              <label key={id}>
                <input type="radio" name="bot" checked={bot === id} onChange={() => setBot(id)} /> {BOTS[id].name}{' '}
                <span className="bot-difficulty">{BOTS[id].difficulty}</span> — {BOTS[id].description}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Rules</legend>
            <label>
              <input type="checkbox" checked={accusi} onChange={(e) => setAccusi(e.target.checked)} /> Accusi (Napoletana,
              three or four Assi/2s/3s)
            </label>
            <label className={players === 2 ? 'disabled' : ''}>
              <input
                type="checkbox"
                checked={players === 4 && signals}
                disabled={players === 2}
                onChange={(e) => setSignals(e.target.checked)}
              />{' '}
              Signals to partner (Busso, Volo, Striscio)
            </label>
          </fieldset>

          {onArtChange && (
            <fieldset>
              <legend>Card style</legend>
              <CardArtPicker value={art} onChange={onArtChange} />
            </fieldset>
          )}

          <button type="submit" className={saved ? undefined : 'primary'}>
            {saved ? 'Deal a new game' : 'Deal'}
          </button>
        </form>

        <details className="rules">
          <summary>How to play</summary>
          <ul>
            <li>40-card Italian deck. Card strength in each suit: 3, 2, Asso, Re, Cavallo, Fante, 7, 6, 5, 4.</li>
            <li>No trumps. You must follow the suit led if you can; the strongest card of that suit takes the trick.</li>
            <li>Asso = 1 point; 2, 3, Re, Cavallo, Fante = ⅓ point each; the last trick is worth 1 extra point. 11 points per hand.</li>
            <li>With 2 players, each of you draws a card after every trick (winner first) until the deck runs out.</li>
            <li>Accusi (optional) are called before your first card: Napoletana (Asso-2-3 of one suit) = 3, three Assi/2s/3s = 3, four = 4.</li>
          </ul>
        </details>

        <label className="asso-toggle">
          <input type="checkbox" checked={assoEffects} onChange={(e) => onAssoEffectsChange(e.target.checked)} /> Asso di
          Coppe effects (shine, celebration and biscotto in 2-player games)
        </label>
      </main>
    </div>
  );
}

function ContinueGame({ saved, onContinue }: { saved: GameState; onContinue: () => void }) {
  const teams = teamNames(saved.config);
  return (
    <section className="continue">
      <button type="button" className="primary" onClick={onContinue} autoFocus>
        Continue game
      </button>
      <p>
        {saved.config.players} players vs {botFor(saved.config).name} · {teams[0]} {saved.scores[0]} – {saved.scores[1]} {teams[1]} · hand{' '}
        {saved.handNumber}
      </p>
    </section>
  );
}
