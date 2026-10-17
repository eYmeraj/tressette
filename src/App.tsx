import { useState } from 'react';
import { GameConfig } from './engine/game';
import { PiacentineDefs } from './components/Card';
import { Setup } from './components/Setup';
import { GameScreen } from './components/GameScreen';

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  return (
    <>
      <PiacentineDefs />
      {config ? <GameScreen config={config} onQuit={() => setConfig(null)} /> : <Setup onStart={setConfig} />}
    </>
  );
}
