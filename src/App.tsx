import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { GameConfig } from './engine/game';
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

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
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
        {config ? (
          <GameScreen config={config} art={art} onArtChange={onArtChange} onQuit={() => setConfig(null)} />
        ) : (
          <Setup art={art} onArtChange={onArtChange} onStart={setConfig} />
        )}
      </CardArtContext.Provider>
    </MotionConfig>
  );
}
