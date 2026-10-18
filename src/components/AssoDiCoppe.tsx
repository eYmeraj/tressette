import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ASSO_DI_COPPE } from '../engine/cards';
import { CardView } from './Card';

const CELEBRATION_MS = 3600;
const CONFETTI_COLOURS = ['var(--gold)', 'var(--team-0)', 'var(--cream)', '#c0392b', '#2e86de', '#27ae60'];
/** Where each bite comes out of the cookie (x%, y%, radius%); the last bite finishes it. */
const BITE_SPOTS = [
  [88, 18, 18],
  [96, 52, 16],
];
const BITES = BITE_SPOTS.length + 1;

function bitten(bites: number): CSSProperties {
  if (!bites) return {};
  const mask = BITE_SPOTS.slice(0, bites)
    .map(([x, y, r]) => `radial-gradient(circle at ${x}% ${y}%, transparent ${r}%, #000 ${r + 1}%)`)
    .join(', ');
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' };
}

/**
 * Full-screen moment after the trick with the Asso di Coppe: a party if the player's side took it (`won`),
 * a cookie if not.
 */
export function AssoDiCoppeMoment({ won, onDone }: { won: boolean; onDone: () => void }) {
  return won ? <Celebration onDone={onDone} /> : <ConsolationCookie onDone={onDone} />;
}

function Celebration({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);
  const confetti = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 30,
        delay: Math.random() * 0.8,
        duration: 2 + Math.random() * 1.4,
        spin: (Math.random() - 0.5) * 1080,
        colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
        round: i % 3 === 0,
      })),
    [],
  );
  return (
    <motion.div
      className="asso-moment"
      role="status"
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="asso-rays" aria-hidden="true" />
      {confetti.map((c) => (
        <motion.span
          key={c.id}
          className={c.round ? 'confetti round' : 'confetti'}
          style={{ left: `${c.left}%`, background: c.colour }}
          initial={{ y: '-10vh', x: 0, rotate: 0 }}
          animate={{ y: '110vh', x: `${c.drift}vw`, rotate: c.spin }}
          transition={{ duration: c.duration, delay: c.delay, ease: 'easeIn' }}
          aria-hidden="true"
        />
      ))}
      <motion.div
        className="asso-hero"
        initial={{ scale: 0.2, rotate: -25, y: 40 }}
        animate={{ scale: 1, rotate: [-25, 8, -4, 0], y: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 12, rotate: { duration: 0.9, ease: 'easeOut' } }}
      >
        <CardView card={ASSO_DI_COPPE} />
      </motion.div>
      <motion.h2
        className="asso-title"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.15, 1], opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.6 }}
      >
        Brava torta!
      </motion.h2>
    </motion.div>
  );
}

function ConsolationCookie({ onDone }: { onDone: () => void }) {
  const [bites, setBites] = useState(0);
  // Only the latest bite's crumbs are kept; earlier ones have already faded out.
  const [crumbs, setCrumbs] = useState<{ id: number; x: number; y: number }[]>([]);
  const eaten = bites >= BITES;

  // No way out but through: the moment only ends once the whole cookie is eaten.
  useEffect(() => {
    if (!eaten) return;
    const t = window.setTimeout(onDone, 1600);
    return () => window.clearTimeout(t);
  }, [onDone, eaten]);

  const bite = () => {
    if (eaten) return;
    setBites(bites + 1);
    setCrumbs(
      Array.from({ length: 8 }, (_, i) => ({ id: bites * 8 + i, x: (Math.random() - 0.5) * 160, y: 40 + Math.random() * 120 })),
    );
  };

  return (
    <motion.div
      className="asso-moment cookie-moment"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="cookie-wrap">
        <AnimatePresence>
          {!eaten && (
            <motion.button
              type="button"
              className="cookie"
              style={bitten(bites)}
              aria-label="Eat the biscotto"
              onClick={bite}
              autoFocus
              initial={{ y: '-60vh', rotate: -40 }}
              animate={{ y: 0, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 220, damping: 11 }}
            >
              🍪
            </motion.button>
          )}
        </AnimatePresence>
        {crumbs.map((c) => (
          <motion.span
            key={c.id}
            className="crumb"
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: c.x, y: c.y, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            aria-hidden="true"
          />
        ))}
      </div>
      <h2 id="cookie-title" className="asso-title">{eaten ? 'Gnam gnam!' : 'Your asso is gone, take this biscotto instead'}</h2>
      {!eaten && <p className="cookie-hint">Tap to take a bite</p>}
    </motion.div>
  );
}
