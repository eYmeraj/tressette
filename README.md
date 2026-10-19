# Tressette

The Italian trick-taking card game in the browser, with the standard Piacentine deck (public-domain scan, see CREDITS.md) or an Engraved version of it (gold on suit-coloured grounds), chosen at setup or in Settings.
Play 2-player (head to head, drawing from the deck) or 4-player (2 vs 2) against AI bots, from simple rules of
thumb up to a neural network trained by self-play: see [BOTS.md](BOTS.md) for who you're playing against.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests, including full simulated games
npm run build
npm run arena -- --a classic --b classic --games 2000 --players 2   # compare two bots
```

## Layout

- `src/engine/` — pure, framework-free game logic
  - `cards.ts` deck, strength order (3 2 A R C F 7 6 5 4), point values in thirds
  - `rules.ts` follow-suit, trick winner, accusi detection
  - `game.ts` immutable state machine: `newGame → playCard → collectTrick → nextHand`
  - `view.ts` `SeatView`: what one seat may know (its hand, public play); the only thing bots see
  - `bots/` the bot interface and registry (`BOTS`, chosen at setup):
    - `classic.ts` (Easy) plays by rules of thumb
    - `stats.ts` (Medium/Hard) Monte Carlo: `sample.ts` deals the hidden cards consistently with what the seat has
      seen (played cards, shown voids, face-up draws, accusi), each legal card is played out with the classic bot,
      and the best average margin wins; Hard also solves the 2-player endgame exactly (`endgame.ts`)
  - `random.ts` seeded RNG for replayable simulations
- `src/components/` — React UI (`Card.tsx` renders cards; images live in `public/cards/` and `public/cards-illustrated/`)
- `src/useGame.ts` — wires the engine to React and paces the bots; bot moves run in a Web Worker (`botWorker.ts`, `botClient.ts`)

## Rules implemented

- Must follow suit; no trumps. Asso = 1 pt, 2/3/figures = ⅓ pt, last trick +1; leftover thirds are dropped (11 pts per hand).
- Accusi before your first card: Napoletana (A-2-3 same suit) 3, three Assi/2s/3s 3, four 4.
- 4-player signals on the lead card: Busso, Volo, Striscio.
- First team to the target (21/31/41) wins; a tie keeps playing.

## Deploying

Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`; it can also be run by hand from the Actions tab).

`npm run build` produces a static site in `dist/` that any static host can serve.
To run it in a container instead:

```sh
docker build -t tressette .
docker run -p 8080:80 tressette   # http://localhost:8080
```
