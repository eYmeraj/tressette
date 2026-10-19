# Hand sharing (Cloudflare Worker + D1)

Players can opt in ("Share hands" on the setup screen) to send each hand they finish, to help train the bots. The
app sends a `HandRecord` (`src/engine/record.ts`: the deal and every card played) plus an anonymous browser id, a
game id, the opponent and the app version. This Worker replays each hand with the game's own engine, rejects
anything impossible, and stores it in a D1 (SQLite) database. Nothing is sent unless the site was built with
`VITE_HANDS_URL` and the player turned sharing on.

## One-time setup

You need a free Cloudflare account (https://dash.cloudflare.com/sign-up). Then, from `worker/`:

```sh
npx wrangler login                                   # opens the browser to authorise wrangler
npx wrangler d1 create tressette-hands               # prints a database_id
# put that database_id into wrangler.toml (replacing REPLACE_WITH_DATABASE_ID)
npx wrangler d1 execute tressette-hands --remote --file schema.sql
npx wrangler deploy                                  # prints the URL, e.g. https://tressette-hands.<you>.workers.dev
```

Tell the site where to send hands (a GitHub repository variable the deploy workflow passes to the build), then
deploy the site by pushing to `main`:

```sh
gh variable set HANDS_URL --body https://tressette-hands.<you>.workers.dev
```

For local development, put the same line in `.env.local` as `VITE_HANDS_URL=...` (localhost:5173 is an allowed
origin; others are set in `ALLOWED_ORIGINS` in `wrangler.toml`).

## Looking at the data

```sh
# How many hands, and how each opponent is doing (seat 0 is always the person)
npx wrangler d1 execute tressette-hands --remote --command \
  "SELECT bot, players, COUNT(*) AS hands, ROUND(AVG(points_1 - points_0), 2) AS bot_margin FROM hands GROUP BY bot, players"
```

## Turning it into training data

```sh
npx wrangler d1 execute tressette-hands --remote --json \
  --command "SELECT record FROM hands WHERE players = 2" > ../ml/data/hands.json
cd .. && npm run -s human-hands -- --in ml/data/hands.json --out ml/data/human-1
```

Every decision in those hands is scored by the Master search (`--teacher`), as in self-play, and saved in the
self-play format, so `ml/train.py --data 'data/human-*,data/f2-gen-*'` trains on it alongside the rest. The
network learns from the positions people reach, scored by the search, not by copying people's moves.
