import { Card, Rank, Suit, cardName } from '../engine/cards';

/* Piacentine-style palette */
const GOLD = '#e3a51c';
const GOLD_DARK = '#7a4a0c';
const RED = '#c8362b';
const BLUE = '#3a6fb7';
const BLUE_DARK = '#1d3a66';
const GREEN = '#4f8a3a';
const GREEN_DARK = '#2a4d1c';
const INK = '#2b2118';
const SKIN = '#f3d3a8';

const ROBE: Record<Suit, string> = { coppe: RED, denari: GOLD, spade: BLUE, bastoni: GREEN };
const INDEX_COLOR: Record<Suit, string> = { coppe: RED, denari: GOLD_DARK, spade: BLUE_DARK, bastoni: GREEN_DARK };

/** Shared SVG symbols; render once anywhere in the document. */
export function PiacentineDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="pip-denari" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.5" />
          <circle cx="20" cy="20" r="13.5" fill={RED} stroke={GOLD_DARK} />
          <circle cx="20" cy="20" r="10" fill="#f4cf5a" />
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cx="20" cy="13.5" rx="2.2" ry="4.2" fill={BLUE} transform={`rotate(${i * 45} 20 20)`} />
          ))}
          <circle cx="20" cy="20" r="3" fill={RED} stroke={GOLD_DARK} strokeWidth="0.6" />
        </symbol>

        <symbol id="pip-coppe" viewBox="0 0 40 40">
          <path d="M7 5 H33 Q33 20 20 22.5 Q7 20 7 5Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.2" />
          <path d="M7.4 9 H32.6 Q32.4 11.5 32 13 H8 Q7.6 11.5 7.4 9Z" fill={RED} />
          <path d="M18 22.5 H22 L21 29 H19Z" fill={BLUE} stroke={BLUE_DARK} strokeWidth="0.6" />
          <ellipse cx="20" cy="29.5" rx="4.2" ry="1.9" fill={RED} stroke={GOLD_DARK} strokeWidth="0.6" />
          <path d="M11 37.5 Q20 28 29 37.5Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.2" />
        </symbol>

        <symbol id="pip-spade" viewBox="0 0 16 64">
          <path d="M8 1.5 Q12.5 18 10.2 46 H5.8 Q3.5 18 8 1.5Z" fill={BLUE} stroke={BLUE_DARK} strokeWidth="0.8" />
          <path d="M8 6 V44" stroke="#d6e4f7" strokeWidth="0.9" />
          <rect x="1" y="45.5" width="14" height="3.2" rx="1.6" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.6" />
          <rect x="6.3" y="48.7" width="3.4" height="9" fill={RED} />
          <circle cx="8" cy="60.4" r="2.7" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.6" />
        </symbol>

        <symbol id="pip-bastoni" viewBox="0 0 16 64">
          <path d="M6 62.5 L3.6 7 Q8 -1 12.4 7 L10 62.5 Q8 64 6 62.5Z" fill={GREEN} stroke={GREEN_DARK} strokeWidth="0.8" />
          <path d="M4.2 14 H11.8 M4.6 26 H11.4 M5 38 H11 M5.4 50 H10.6" stroke={RED} strokeWidth="2" />
          <ellipse cx="6" cy="20" rx="1.3" ry="2" fill={GREEN_DARK} />
          <ellipse cx="10" cy="32" rx="1.2" ry="1.8" fill={GREEN_DARK} />
          <ellipse cx="6.4" cy="44" rx="1.1" ry="1.7" fill={GREEN_DARK} />
        </symbol>

        <pattern id="card-back-pattern" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#8f1d1d" />
          <rect width="5" height="5" fill="#b8322b" />
          <circle cx="7.5" cy="7.5" r="1.3" fill={GOLD} />
        </pattern>

        <clipPath id="card-inner">
          <rect x="6" y="6" width="88" height="148" rx="4" />
        </clipPath>
      </defs>
    </svg>
  );
}

interface Pip {
  x: number;
  y: number;
  rot?: number;
}

const ROUND_LAYOUTS: Record<number, Pip[]> = {
  2: [{ x: 50, y: 42 }, { x: 50, y: 118 }],
  3: [{ x: 50, y: 32 }, { x: 50, y: 80 }, { x: 50, y: 128 }],
  4: [{ x: 31, y: 44 }, { x: 69, y: 44 }, { x: 31, y: 116 }, { x: 69, y: 116 }],
  5: [{ x: 31, y: 38 }, { x: 69, y: 38 }, { x: 50, y: 80 }, { x: 31, y: 122 }, { x: 69, y: 122 }],
  6: [{ x: 31, y: 34 }, { x: 69, y: 34 }, { x: 31, y: 80 }, { x: 69, y: 80 }, { x: 31, y: 126 }, { x: 69, y: 126 }],
  7: [
    { x: 31, y: 30 }, { x: 69, y: 30 }, { x: 50, y: 55 }, { x: 31, y: 82 }, { x: 69, y: 82 },
    { x: 31, y: 130 }, { x: 69, y: 130 },
  ],
};

/** Swords and batons fan out in a crossed bundle, as on Piacentine cards. */
function longLayout(count: number): Pip[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const rot = (i % 2 === 0 ? 1 : -1) * (count > 3 ? 22 : 12);
    return { x: 50 + (t - 0.5) * Math.min(48, count * 10), y: 80, rot };
  });
}

function Pips({ suit, rank }: { suit: Suit; rank: Rank }) {
  const long = suit === 'spade' || suit === 'bastoni';
  if (rank === 1) {
    return long ? (
      <use href={`#pip-${suit}`} x={33.5} y={14} width={33} height={132} />
    ) : (
      <>
        <circle cx="50" cy="80" r="34" fill="none" stroke={INDEX_COLOR[suit]} strokeWidth="1" strokeDasharray="2 3" />
        <use href={`#pip-${suit}`} x={22} y={52} width={56} height={56} />
      </>
    );
  }
  if (long) {
    return (
      <>
        {longLayout(rank).map((p, i) => (
          <use
            key={i}
            href={`#pip-${suit}`}
            x={p.x - 13}
            y={28}
            width={26}
            height={104}
            transform={`rotate(${p.rot} ${p.x} ${p.y})`}
          />
        ))}
      </>
    );
  }
  const size = rank >= 6 ? 24 : 28;
  return (
    <>
      {ROUND_LAYOUTS[rank].map((p, i) => (
        <use key={i} href={`#pip-${suit}`} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} />
      ))}
    </>
  );
}

/** Top half of a double-headed figure; it is mirrored for the bottom half. */
function FigureHalf({ suit, rank }: { suit: Suit; rank: Rank }) {
  const robe = ROBE[suit];
  const long = suit === 'spade' || suit === 'bastoni';
  const held = long ? (
    <use href={`#pip-${suit}`} x={62} y={20} width={11} height={44} transform="rotate(18 68 42)" />
  ) : (
    <use href={`#pip-${suit}`} x={60} y={44} width={18} height={18} />
  );

  if (rank === 9) {
    // Cavallo: rider on horseback
    return (
      <g stroke={INK} strokeWidth="0.8">
        <path d="M14 80 Q16 58 26 50 Q30 40 38 42 L42 47 Q38 52 36 58 Q40 70 40 80Z" fill="#9a6532" />
        <path d="M26 50 Q30 38 38 42" fill="none" stroke="#5a3a1a" strokeWidth="3" />
        <circle cx="33" cy="47" r="1.2" fill={INK} stroke="none" />
        <path d="M42 80 L46 46 Q56 38 66 46 L70 80Z" fill={robe} />
        <circle cx="56" cy="30" r="7.5" fill={SKIN} />
        <path d="M47 27 Q56 16 65 27 Q56 24 47 27Z" fill={RED} />
        <path d="M60 18 Q66 10 70 14" fill="none" stroke={GOLD} strokeWidth="1.6" />
        {held}
      </g>
    );
  }

  const isRe = rank === 10;
  return (
    <g stroke={INK} strokeWidth="0.8">
      <path d="M24 80 L31 47 Q50 37 69 47 L76 80Z" fill={robe} />
      <path d="M38 80 L42 50 H58 L62 80Z" fill={isRe ? '#f6efe0' : GOLD} opacity="0.9" />
      <ellipse cx="50" cy="45" rx="12" ry="3.6" fill="#f6efe0" />
      <circle cx="50" cy="32" r="8.5" fill={SKIN} />
      {isRe ? (
        <>
          <path d="M42.5 35 Q50 48 57.5 35 Q50 40 42.5 35Z" fill="#6b4320" />
          <path d="M41 25 L42 14 L46 20 L50 12 L54 20 L58 14 L59 25Z" fill={GOLD} />
          <circle cx="50" cy="17" r="1.4" fill={RED} stroke="none" />
        </>
      ) : (
        <>
          <ellipse cx="50" cy="25" rx="11" ry="4" fill={robe} />
          <path d="M58 23 Q68 12 72 18 Q66 18 60 25Z" fill={RED} />
        </>
      )}
      {held}
    </g>
  );
}

export function CardFace({ card }: { card: Card }) {
  const { suit, rank } = card;
  const figure = rank >= 8;
  return (
    <svg viewBox="0 0 100 160" className="card-svg" role="img" aria-label={cardName(card)}>
      <rect x="1" y="1" width="98" height="158" rx="7" fill="#fbf6e8" stroke="#3b3024" strokeWidth="1.2" />
      {figure ? (
        <g clipPath="url(#card-inner)">
          <rect x="6" y="6" width="88" height="148" fill="#f1e6c8" />
          <FigureHalf suit={suit} rank={rank} />
          <g transform="rotate(180 50 80)">
            <FigureHalf suit={suit} rank={rank} />
          </g>
          <line x1="6" y1="80" x2="94" y2="80" stroke={INK} strokeWidth="1" />
          <rect x="6" y="6" width="88" height="148" rx="4" fill="none" stroke={INK} strokeWidth="1.2" />
        </g>
      ) : (
        <Pips suit={suit} rank={rank} />
      )}
      <g fill={INDEX_COLOR[suit]} fontFamily="Georgia, serif" fontWeight="700" fontSize="15" textAnchor="middle">
        <text x="13" y="20" stroke="#fbf6e8" strokeWidth="3" paintOrder="stroke">{rank}</text>
        <text x="13" y="20" transform="rotate(180 50 80)" stroke="#fbf6e8" strokeWidth="3" paintOrder="stroke">{rank}</text>
      </g>
    </svg>
  );
}

export function CardBack() {
  return (
    <svg viewBox="0 0 100 160" className="card-svg" aria-hidden="true">
      <rect x="1" y="1" width="98" height="158" rx="7" fill="#fbf6e8" stroke="#3b3024" strokeWidth="1.2" />
      <rect x="6" y="6" width="88" height="148" rx="4" fill="url(#card-back-pattern)" />
      <rect x="6" y="6" width="88" height="148" rx="4" fill="none" stroke={GOLD} strokeWidth="1.5" />
    </svg>
  );
}

interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  onClick?: () => void;
  playable?: boolean;
  dimmed?: boolean;
  className?: string;
}

export function CardView({ card, faceDown, onClick, playable, dimmed, className = '' }: CardViewProps) {
  const classes = ['card', playable && 'playable', dimmed && 'dimmed', className].filter(Boolean).join(' ');
  const face = faceDown || !card ? <CardBack /> : <CardFace card={card} />;
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} disabled={!playable} title={card && cardName(card)}>
        {face}
      </button>
    );
  }
  return <div className={classes}>{face}</div>;
}
