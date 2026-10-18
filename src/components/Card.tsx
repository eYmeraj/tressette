import { CSSProperties, createContext, useContext } from 'react';
import { motion, Transition } from 'framer-motion';
import { Card, cardName, newDeck } from '../engine/cards';

/** Spring used for every card flight (deal, play, draw) so they all feel alike. */
export const CARD_SPRING: Transition = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 };

export type CardArt = 'classic' | 'illustrated';

export const CARD_ARTS: Record<CardArt, { label: string; dir: string }> = {
  classic: { label: 'Classic', dir: 'cards' },
  illustrated: { label: 'Engraved', dir: 'cards-illustrated' },
};

/** Which deck's faces every card on screen shows. */
export const CardArtContext = createContext<CardArt>('classic');

function cardImage(card: Card, art: CardArt): string {
  return `${import.meta.env.BASE_URL}${CARD_ARTS[art].dir}/${card.id}.webp`;
}

/** Fetch and decode every face up front so cards don't pop in halfway through a flight. */
export function preloadCardImages(art: CardArt) {
  for (const card of newDeck()) {
    const img = new Image();
    img.src = cardImage(card, art);
    img.decode().catch(() => {});
  }
}

export function CardFace({ card, art }: { card: Card; art?: CardArt }) {
  const contextArt = useContext(CardArtContext);
  return (
    <img
      className="card-face"
      src={cardImage(card, art ?? contextArt)}
      alt={cardName(card)}
      draggable={false}
      decoding="async"
    />
  );
}

export function CardBack() {
  return <div className="card-back" aria-hidden="true" />;
}

interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  onClick?: () => void;
  playable?: boolean;
  dimmed?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Cards sharing a layoutId animate from their old spot on screen to the new one. */
  layoutId?: string;
}

/** The Asso di Coppe gets extra flair wherever it shows face up. */
function isSpecial(card: Card): boolean {
  return card.suit === 'coppe' && card.rank === 1;
}

export function CardView({ card, faceDown, onClick, playable, dimmed, className = '', style, layoutId }: CardViewProps) {
  const faceUp = !faceDown && card;
  const classes = ['card', playable && 'playable', dimmed && 'dimmed', faceUp && isSpecial(card) && 'special', className]
    .filter(Boolean)
    .join(' ');
  const face = faceUp ? <CardFace card={card} /> : <CardBack />;
  if (onClick) {
    return (
      <motion.button
        type="button"
        layoutId={layoutId}
        transition={CARD_SPRING}
        className={classes}
        style={style}
        onClick={onClick}
        disabled={!playable}
        title={card && cardName(card)}
      >
        {face}
      </motion.button>
    );
  }
  return (
    <motion.div layoutId={layoutId} transition={CARD_SPRING} className={classes} style={style}>
      {face}
    </motion.div>
  );
}
