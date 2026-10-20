import { useEffect, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { GameState, newGame } from './engine/game';
import { clearSavedGame, loadSavedGame } from './savedGame';
import { CARD_ARTS, CardArt, CardArtContext, preloadCardImages } from './components/Card';
import { Setup } from './components/Setup';
import { GameScreen } from './components/GameScreen';
import { setOnSetupScreen } from './pwa';
import { read, write } from './settings';

const ART_KEY = 'tressette.cardArt';
/** The card-style choice is parked for now: everyone plays with the classic deck and no picker is shown. */
const CARD_ART_CHOICE = false;

function savedArt(): CardArt {
  const v = CARD_ART_CHOICE && read(ART_KEY);
  return v && v in CARD_ARTS ? (v as CardArt) : 'classic';
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
  const [art, setArt] = useState(savedArt);
  useEffect(() => {
    preloadCardImages(art);
    if (CARD_ART_CHOICE) write(ART_KEY, art);
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
            />
          </motion.div>
        )}
      </CardArtContext.Provider>
    </MotionConfig>
  );
}
