import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { GameState, newGame } from './engine/game';
import { clearSavedGame, loadSavedGame } from './savedGame';
import { CARD_ARTS, CardArt, CardArtContext, preloadCardImages } from './components/Card';
import { Setup } from './components/Setup';
import { GameScreen } from './components/GameScreen';

const ART_KEY = 'tressette.cardArt';
/** The card-style choice is parked for now: everyone plays with the classic deck and no picker is shown. */
const CARD_ART_CHOICE = false;

function savedArt(): CardArt {
  try {
    if (!CARD_ART_CHOICE) return 'classic';
    const v = localStorage.getItem(ART_KEY);
    if (v && v in CARD_ARTS) return v as CardArt;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to the default.
  }
  return 'classic';
}

const ASSO_KEY = 'tressette.assoEffects';

function savedAssoEffects(): boolean {
  try {
    return localStorage.getItem(ASSO_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** A gentle fade and settle between the home screen and the table. */
const screen = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 1.02, transition: { duration: 0.25, ease: 'easeIn' } },
} as const;

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [assoEffects, setAssoEffects] = useState(savedAssoEffects);
  const changeAssoEffects = (on: boolean) => {
    setAssoEffects(on);
    try {
      localStorage.setItem(ASSO_KEY, on ? 'on' : 'off');
    } catch {
      // Not remembering the choice is fine.
    }
  };
  const [art, setArt] = useState(savedArt);
  useEffect(() => {
    preloadCardImages(art);
    if (!CARD_ART_CHOICE) return;
    try {
      localStorage.setItem(ART_KEY, art);
    } catch {
      // Not remembering the choice is fine.
    }
  }, [art]);
  const onArtChange = CARD_ART_CHOICE ? setArt : undefined;
  return (
    <MotionConfig reducedMotion="user">
      <CardArtContext.Provider value={art}>
        <AnimatePresence mode="wait">
          {game ? (
            <motion.div key="game" className="screen" {...screen}>
              <GameScreen
                start={game}
                assoEffects={assoEffects}
                art={art}
                onArtChange={onArtChange}
                onQuit={() => {
                  clearSavedGame();
                  setGame(null);
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="setup" className="screen" {...screen}>
              <Setup
                art={art}
                onArtChange={onArtChange}
                saved={loadSavedGame()}
                onContinue={setGame}
                onStart={(config) => setGame(newGame(config))}
                assoEffects={assoEffects}
                onAssoEffectsChange={changeAssoEffects}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </CardArtContext.Provider>
    </MotionConfig>
  );
}
