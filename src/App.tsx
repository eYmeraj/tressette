import { useEffect, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { GameState, newGame } from './engine/game';
import { clearSavedGame, loadSavedGame } from './savedGame';
import { CARD_ARTS, CardArt, CardArtContext, preloadCardImages } from './components/Card';
import { Setup } from './components/Setup';
import { GameScreen } from './components/GameScreen';
import { setOnSetupScreen } from './pwa';

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

/**
 * Each screen fades in as it arrives. Opacity only (scaling would throw off where the dealt cards' flights start),
 * and no exit animation: waiting on the outgoing table to finish animating left the page blank on quit, because
 * its cards' layout animations never reported done.
 */
const screen = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } },
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
  useEffect(() => setOnSetupScreen(!game), [game]);
  return (
    <MotionConfig reducedMotion="user">
      <CardArtContext.Provider value={art}>
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
      </CardArtContext.Provider>
    </MotionConfig>
  );
}
