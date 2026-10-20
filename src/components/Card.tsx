import { CSSProperties, createContext, useContext } from 'react';
import { motion, Transition } from 'framer-motion';
import { Card, DECK, cardName, isAssoDiCoppe } from '../engine/cards';
import { storedFlag } from '../settings';

/** Spring used for every card flight (deal, play, draw) so they all feel alike. */
export const CARD_SPRING: Transition = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 };
/** A slower, softer flight for a drawn card going from beside the deck into a hand, so it can be followed. */
export const DRAW_SPRING: Transition = { type: 'spring', stiffness: 90, damping: 20, mass: 1.1 };

export type CardArt = 'classic' | 'illustrated';

export const CARD_ARTS: Record<CardArt, { label: string; dir: string }> = {
  classic: { label: 'Classic', dir: 'cards' },
  illustrated: { label: 'Engraved', dir: 'cards-illustrated' },
};

/** Which deck's faces every card on screen shows. */
export const CardArtContext = createContext<CardArt>('classic');

/** Whether the Asso di Coppe shows its extra flair; only the 2-player game turns it on. */
export const AssoFlairContext = createContext(false);

/** The player's choice to show the Asso di Coppe's flair and moments (2-player games), on unless turned off. */
export const useAssoEffects = storedFlag('tressette.assoEffects', true).use;

function cardImage(card: Card, art: CardArt): string {
  return `${import.meta.env.BASE_URL}${CARD_ARTS[art].dir}/${card.id}.webp`;
}

/**
 * Decoded faces, held for the life of the page. Without a reference the browser may drop them from its memory
 * cache, and every card that lands somewhere new (a fresh <img>) would flash its white background while the
 * image is fetched again.
 */
const decodedFaces = new Map<string, HTMLImageElement>();

/** Fetch and decode every face up front so cards don't pop in halfway through a flight. */
export function preloadCardImages(art: CardArt) {
  for (const card of DECK) {
    const src = cardImage(card, art);
    if (decodedFaces.has(src)) continue;
    const img = new Image();
    img.src = src;
    img.decode().catch(() => {});
    decodedFaces.set(src, img);
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
      // Decode with the frame: a card that lands somewhere new mounts a fresh <img>, and async decoding can show
      // it blank for a frame (a flicker on phones). The faces are small and preloaded, so this is cheap.
      decoding="sync"
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
  /** How this card flies into place; CARD_SPRING unless given. */
  transition?: Transition;
}

/** Holographic foil and twinkling sparkles laid over the Asso di Coppe; the art underneath is untouched. */
function SpecialShine() {
  return (
    <>
      <span className="foil" aria-hidden="true" />
      <span className="sparkles" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i}>✦</i>
        ))}
      </span>
    </>
  );
}

export function CardView({
  card,
  faceDown,
  onClick,
  playable,
  dimmed,
  className = '',
  style,
  layoutId,
  transition = CARD_SPRING,
}: CardViewProps) {
  const faceUp = !faceDown && card;
  // The Asso di Coppe gets extra flair wherever it shows face up.
  const special = useContext(AssoFlairContext) && faceUp && isAssoDiCoppe(card);
  const classes = ['card', playable && 'playable', dimmed && 'dimmed', special && 'special', className]
    .filter(Boolean)
    .join(' ');
  const face = (
    <>
      {faceUp ? <CardFace card={card} /> : <CardBack />}
      {special && <SpecialShine />}
    </>
  );
  if (onClick) {
    return (
      <motion.button
        type="button"
        layoutId={layoutId}
        transition={transition}
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
    <motion.div layoutId={layoutId} transition={transition} className={classes} style={style}>
      {face}
    </motion.div>
  );
}
