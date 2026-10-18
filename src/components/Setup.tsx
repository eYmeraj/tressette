import { useState } from 'react';
import { SUITS, makeCard } from '../engine/cards';
import { GameConfig } from '../engine/game';
import { CardArt, CardView } from './Card';
import { CardArtPicker } from './CardArtPicker';

const PREVIEW = SUITS.map((suit) => makeCard(suit, 1));

export function Setup({
  art,
  onArtChange,
  onStart,
}: {
  art: CardArt;
  /** Omitted while the card-style choice is parked. */
  onArtChange?: (art: CardArt) => void;
  onStart: (config: GameConfig) => void;
}) {
  const [players, setPlayers] = useState<2 | 4>(4);
  const [targetScore, setTarget] = useState(31);
  const [accusi, setAccusi] = useState(true);
  const [signals, setSignals] = useState(true);

  return (
    <main className="setup">
      <h1>Tressette</h1>
      <div className="setup-cards">
        {PREVIEW.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
      </div>

      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ players, targetScore, accusi, signals: players === 4 && signals });
        }}
      >
        <fieldset>
          <legend>Players</legend>
          <label>
            <input type="radio" name="players" checked={players === 4} onChange={() => setPlayers(4)} /> 4 players — you and Giulia vs two bots
          </label>
          <label>
            <input type="radio" name="players" checked={players === 2} onChange={() => setPlayers(2)} /> 2 players — head to head, drawing from the deck
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

        <button type="submit" className="primary">Deal</button>
      </form>

      <details className="rules">
        <summary>How to play</summary>
        <ul>
          <li>40-card Italian deck. Card strength in each suit: 3, 2, Asso, Re, Cavallo, Fante, 7, 6, 5, 4.</li>
          <li>No trumps. You must follow the suit led if you can; the strongest card of that suit takes the trick.</li>
          <li>Asso = 1 point; 2, 3, Re, Cavallo, Fante = ⅓ point each; the last trick is worth 1 extra point. 11 points per hand.</li>
          <li>With 2 players, each of you draws a card after every trick (winner first) until the deck runs out.</li>
          <li>Accusi are declared before your first card: Napoletana (Asso-2-3 of one suit) = 3, three Assi/2s/3s = 3, four = 4.</li>
        </ul>
      </details>
    </main>
  );
}
