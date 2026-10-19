-- One row per shared hand. `record` is the HandRecord JSON (src/engine/record.ts), checked by replaying it.
-- Seat 0 is always the person; points_0/points_1 are each team's points for the hand.
CREATE TABLE IF NOT EXISTS hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  player TEXT NOT NULL,      -- random id made by the player's browser
  game TEXT NOT NULL,        -- random id per game, to group its hands
  hand_number INTEGER NOT NULL,
  bot TEXT NOT NULL,         -- opponent id (classic, stats-medium, stats-hard, neural, expert)
  app TEXT NOT NULL,         -- commit the site was built from
  players INTEGER NOT NULL,
  points_0 INTEGER NOT NULL,
  points_1 INTEGER NOT NULL,
  record TEXT NOT NULL,
  UNIQUE (player, game, hand_number)
);
CREATE INDEX IF NOT EXISTS hands_bot ON hands (bot, players);
