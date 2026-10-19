/// Offline play: registers the service worker (see vite.config.ts) that keeps the whole app on the device.
/// A new version downloads in the background and takes over only while the setup screen is showing, so a game is
/// never reloaded halfway through a hand (it's saved after every move, so Continue picks it up either way).
import { registerSW } from 'virtual:pwa-register';

let pendingUpdate: (() => void) | null = null;
let onSetup = false;

function applyUpdate() {
  if (!pendingUpdate || !onSetup) return;
  const apply = pendingUpdate;
  pendingUpdate = null;
  apply();
}

const updateSW = registerSW({
  onNeedRefresh() {
    pendingUpdate = () => void updateSW(true);
    applyUpdate();
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // An installed app stays open in the background for days: look for a new version whenever it comes to the front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
    });
  },
});

/** Tells the updater whether the setup screen (not a game) is showing, the only time an update may reload the page. */
export function setOnSetupScreen(value: boolean) {
  onSetup = value;
  applyUpdate();
}
