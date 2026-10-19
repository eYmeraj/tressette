/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base URL of the hand-sharing Worker (worker/); sharing is offered only when set. */
  readonly VITE_HANDS_URL?: string;
  /** The commit the site was built from (set by the deploy workflow), sent with shared hands. */
  readonly VITE_APP_VERSION?: string;
}
