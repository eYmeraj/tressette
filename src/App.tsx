import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { GameConfig } from './engine/game';
import { preloadCardImages } from './components/Card';
import { Setup } from './components/Setup';
import { GameScreen } from './components/GameScreen';

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  useEffect(preloadCardImages, []);
  return (
    <MotionConfig reducedMotion="user">
      {config ? <GameScreen config={config} onQuit={() => setConfig(null)} /> : <Setup onStart={setConfig} />}
    </MotionConfig>
  );
}
