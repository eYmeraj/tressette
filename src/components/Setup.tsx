import { useState } from 'react';
import { SUITS, makeCard } from '../engine/cards';
import { GameConfig, GameState } from '../engine/game';
import { BOTS, BotId, DEFAULT_BOT, botFor, botPlays } from '../engine/bots';
import { endiName, teamNames } from '../labels';
import { useSoundOn } from '../sounds';
import { HANDS_URL, useShareHands } from '../sharing';
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
  const [soundOn, setSoundOn] = useSoundOn();
  const [share, setShare] = useShareHands();

  const bots = (Object.keys(BOTS) as BotId[]).filter((id) => botPlays(BOTS[id], players));
  // A 2-player-only opponent chosen before switching to 4 players falls back to the default.
  const chosen = bots.includes(bot) ? bot : DEFAULT_BOT;
  const start = () => onStart({ players, targetScore, accusi, signals: players === 4 && signals, bot: chosen });

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

        <div className="options">
          <Choice label="Players" value={players} options={[2, 4] as const} onChange={setPlayers} />
          <Choice label="Play to" value={targetScore} options={[21, 31, 41]} onChange={setTarget} />
          <Choice
            label="Opponents"
            value={chosen}
            options={bots}
            onChange={setBot}
            name={(id) => BOTS[id].label}
            hint={(id) => BOTS[id].description}
          />
          <div className="option-row">
            <span className="option-spacer" />
            <span className="opponent-name">You play {endiName(BOTS[chosen])}</span>
          </div>
          <OnOff label="Accusi" on={accusi} onChange={setAccusi} hint="Napoletana, three or four Assi/2s/3s" />
          {players === 4 && (
            <OnOff label="Signals" on={signals} onChange={setSignals} hint="Busso, Volo and Striscio to your partner" />
          )}
          <OnOff label="Sounds" on={soundOn} onChange={setSoundOn} hint="Cards, tricks and the end of each hand" />
          <OnOff
            label="I love Asso di Coppe"
            on={assoEffects}
            onChange={onAssoEffectsChange}
            hint="Its shine, the Brava torta! celebration and the biscotto (2-player games)"
          />
          {HANDS_URL && (
            <OnOff
              label="Share hands"
              on={share}
              onChange={setShare}
              hint="Anonymously share the cards played in your hands to help train the bots"
            />
          )}
          {onArtChange && <CardArtPicker value={art} onChange={onArtChange} />}
        </div>

        {saved ? (
          <ContinueGame saved={saved} onContinue={() => onContinue(saved)} onNew={start} />
        ) : (
          <button type="button" className="primary play" onClick={start}>
            Play
          </button>
        )}

        {HANDS_URL && (
          <details className="rules">
            <summary>Sharing hands</summary>
            <p>
              With <em>Share hands</em> on, each hand you finish is sent to help train the bots: the deal, the cards
              everyone played, the score, which opponent you played, and a random id made by this browser (so hands
              from one player can be grouped). Nothing else: no name, account, location or IP address is stored. It's
              off unless you turn it on, and you can turn it off any time.
            </p>
          </details>
        )}

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
      </main>
    </div>
  );
}

/** One setting as a row of buttons: tap to choose. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  name = String,
  hint,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  name?: (value: T) => string;
  hint?: (value: T) => string;
}) {
  return (
    <div className="option-row">
      <span className="option-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            className={o === value ? 'active' : undefined}
            title={hint?.(o)}
            onClick={() => onChange(o)}
          >
            {name(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A yes/no setting, shown like the others so every row lines up. */
function OnOff({
  label,
  on,
  onChange,
  hint,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  hint: string;
}) {
  return (
    <Choice
      label={label}
      value={on ? 'On' : 'Off'}
      options={['On', 'Off']}
      onChange={(v) => onChange(v === 'On')}
      hint={() => hint}
    />
  );
}

function ContinueGame({ saved, onContinue, onNew }: { saved: GameState; onContinue: () => void; onNew: () => void }) {
  const teams = teamNames(saved.config);
  return (
    <section className="continue">
      <div className="continue-buttons">
        <button type="button" className="primary play" onClick={onContinue}>
          Continue
        </button>
        <button type="button" onClick={onNew}>
          New game
        </button>
      </div>
      <p>
        {teams[0]} {saved.scores[0]} – {saved.scores[1]} {teams[1]} · hand {saved.handNumber} · {botFor(saved.config).label}
      </p>
    </section>
  );
}
