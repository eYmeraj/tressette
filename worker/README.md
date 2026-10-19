# Hand sharing (Cloudflare Worker + D1)

Players can opt in ("Share hands" on the setup screen) to send each 2-player hand they finish, to help train the
bots (only 2-player hands for now, since the ML bots are 2-player only; the app doesn't send others and the Worker
rejects them). The app sends a `HandRecord` (`src/engine/record.ts`: the deal and every card played) plus an
anonymous browser id, a game id, the opponent and the app version. This Worker replays each hand with the game's own engine, rejects
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

The live Worker only accepts hands from the live site (`ALLOWED_ORIGINS` in `wrangler.toml`).

## Local development

Test against a local Worker and a throwaway local database, never the real one:

```sh
cd worker
cp .dev.vars.example .dev.vars                                   # allows http://localhost:5173, locally only
npx wrangler d1 execute tressette-hands --local --file schema.sql
npx wrangler dev                                                 # http://localhost:8787
# in the project root, .env.local:  VITE_HANDS_URL=http://localhost:8787   then npm run dev
npx wrangler d1 execute tressette-hands --local --command "SELECT * FROM hands"
```

## How it's protected

- The browser holds no credentials; the Worker reaches D1 through its binding (`env.DB`), so the database has no
  public address. Only `POST /hands` exists, and it only inserts.
- Each hand is rebuilt field by field (anything unexpected is dropped), replayed with the game engine (impossible
  hands are rejected), and stored once (`UNIQUE (player, game, hand_number)`), with values bound, never pasted into
  the SQL.
- At most 30 hands a minute from one IP address (`[[ratelimits]]` in `wrangler.toml`; change the limit there and
  redeploy), so a script can't flood the database. Bodies over 20 KB are refused; requests from other websites are refused (the origin check stops browsers, not
  scripts, which is why the replay is what really matters).
- `Env` types come from `npx wrangler types` (`worker-configuration.d.ts`); rerun it after changing `wrangler.toml`.

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
