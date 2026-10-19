import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts ship with the app (not from Google Fonts) so they're there offline. Latin only: the game is in English
// and Italian; anything else falls back to the system font.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/kalam/latin-700.css';
import '@fontsource/kalam/latin-ext-400.css';
import '@fontsource/kalam/latin-ext-700.css';
import '@fontsource/italianno/latin-400.css';
import '@fontsource/italianno/latin-ext-400.css';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
