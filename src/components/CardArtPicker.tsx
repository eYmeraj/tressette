import { makeCard } from '../engine/cards';
import { CARD_ARTS, CardArt, CardFace } from './Card';

const SAMPLE = makeCard('coppe', 10);

/** Radio group showing the same card in each deck, so the choice is made by looking at it. */
export function CardArtPicker({ value, onChange }: { value: CardArt; onChange: (art: CardArt) => void }) {
  return (
    <div className="art-picker" role="radiogroup" aria-label="Card style">
      {(Object.keys(CARD_ARTS) as CardArt[]).map((art) => (
        <label key={art} className={value === art ? 'art-option selected' : 'art-option'}>
          <input type="radio" name="card-art" checked={value === art} onChange={() => onChange(art)} />
          <span className="card">
            <CardFace card={SAMPLE} art={art} />
          </span>
          {CARD_ARTS[art].label}
        </label>
      ))}
    </div>
  );
}
