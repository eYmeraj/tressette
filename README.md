# Tressette

The Italian trick-taking card game in the browser, with the standard Piacentine deck (public-domain scan, see CREDITS.md) or an Engraved version of it (gold on suit-coloured grounds), chosen at setup or in Settings.
Play 2-player (head to head, drawing from the deck) or 4-player (2 vs 2) against AI bots.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests, including full simulated games
npm run build
```

## Layout

- `src/engine/` — pure, framework-free game logic
  - `cards.ts` deck, strength order (3 2 A R C F 7 6 5 4), point values in thirds
  - `rules.ts` follow-suit, trick winner, accusi detection
  - `game.ts` immutable state machine: `newGame → playCard → collectTrick → nextHand`
  - `bot.ts` heuristic AI using only information a real player would have
- `src/components/` — React UI (`Card.tsx` renders cards; images live in `public/cards/` and `public/cards-illustrated/`)
- `src/useGame.ts` — wires the engine to React and paces the bots

## Rules implemented

- Must follow suit; no trumps. Asso = 1 pt, 2/3/figures = ⅓ pt, last trick +1; leftover thirds are dropped (11 pts per hand).
- Accusi before your first card: Napoletana (A-2-3 same suit) 3, three Assi/2s/3s 3, four 4.
- 4-player signals on the lead card: Busso, Volo, Striscio.
- First team to the target (21/31/41) wins; a tie keeps playing.
