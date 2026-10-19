import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable from the browser ("Add to Home Screen") and playable offline: a service worker keeps every file of
    // the build, including both decks and the network bots' weights, so nothing is fetched during a game.
    VitePWA({
      // src/pwa.ts registers it and decides when an update takes over.
      registerType: 'prompt',
      injectRegister: false,
      // The icons are already among the files below.
      includeManifestIcons: false,
      manifest: {
        name: 'Tressette',
        short_name: 'Tressette',
        description: 'The Italian trick-taking card game, against bots.',
        lang: 'en',
        display: 'standalone',
        background_color: '#143d27',
        theme_color: '#143d27',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,webp,png,json}'],
        // The weights are 3.5 MB, over Workbox's default 2 MB limit.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: 'node' },
});
