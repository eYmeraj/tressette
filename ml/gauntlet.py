"""Plays one bot against a list of opponents on every core and reports how it does.

Each match is split into seed ranges run as separate `npm run arena -- --json` processes, then added up. Seeds are
played twice with the bots swapping sides, so the point margin per seed pair cancels most of the luck of the deal;
its confidence interval is usually far tighter than the win rate's.

Usage (from ml/):
  .venv/bin/python gauntlet.py --a neural:src/engine/ml/weights-2p.json
  .venv/bin/python gauntlet.py --a neural:new.json --vs neural:old.json:2000 --vs stats-hard:400

Bot specs are relative to the project root. `--vs spec:games` sets a match's length (default per opponent below).
Every result is appended to ml/results.jsonl as soon as its match finishes.
"""

import argparse
import json
import math
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "ml" / "results.jsonl"
DEFAULT_VS = ["classic:2000", "stats-medium:800", "stats-hard:400"]


def split_vs(text: str) -> tuple[str, int]:
    spec, _, games = text.rpartition(":")
    if spec and games.isdigit():
        return spec, int(games)
    return text, 1000


def run_shard(a: str, b: str, games: int, seed: int) -> dict:
    cmd = ["npx", "vite-node", "scripts/arena.ts", "--", "--a", a, "--b", b, "--games", str(games), "--seed", str(seed), "--json"]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(f"arena failed ({' '.join(cmd)}):\n{out.stderr[-2000:]}")
    return json.loads(out.stdout.strip().splitlines()[-1])


def match(pool: ThreadPoolExecutor, a: str, b: str, games: int, workers: int, seed: int):
    """Starts a match as `workers` shards of whole seed pairs; returns futures to pass to `summarise`."""
    pairs = max(1, games // 2)
    per = math.ceil(pairs / workers)
    futures, start = [], 0
    while start < pairs:
        n = min(per, pairs - start)
        futures.append(pool.submit(run_shard, a, b, 2 * n, seed + start))
        start += n
    return futures


def summarise(a: str, b: str, futures) -> dict:
    parts = [f.result() for f in futures]
    games = sum(p["games"] for p in parts)
    wins = sum(p["aWins"] for p in parts)
    hands = sum(p["hands"] for p in parts)
    margins = [m for p in parts for m in p["pairMargins"]]
    rate = wins / games
    # A pair is two games; points per hand = pair margin / hands per pair.
    hands_per_pair = hands / len(margins)
    mean = sum(margins) / len(margins)
    sd = math.sqrt(sum((m - mean) ** 2 for m in margins) / max(1, len(margins) - 1))
    return {
        "a": a,
        "b": b,
        "games": games,
        "win_rate": rate,
        "win_ci": 1.96 * math.sqrt(rate * (1 - rate) / games),
        "margin_per_hand": mean / hands_per_pair,
        "margin_ci": 1.96 * sd / math.sqrt(len(margins)) / hands_per_pair,
        "a_points_per_hand": sum(p["aPoints"] for p in parts) / hands,
        "b_points_per_hand": sum(p["bPoints"] for p in parts) / hands,
        "cpu_seconds": sum(p["ms"] for p in parts) / 1000,
    }


def gauntlet(a: str, vs: list[str], workers: int = os.cpu_count() or 8, seed: int = 1, label: str = "") -> list[dict]:
    """Plays every match (shards of all matches share one pool). Each match is printed and appended to
    results.jsonl as soon as it finishes, so a stopped run keeps the matches it completed."""
    started = time.time()
    print(f"{a}", flush=True)
    results = []
    with ThreadPoolExecutor(workers) as pool:
        pending = [(b, match(pool, a, b, games, workers, seed)) for b, games in map(split_vs, vs)]
        for b, fs in pending:
            r = summarise(a, b, fs)
            results.append(r)
            with RESULTS.open("a") as f:
                f.write(json.dumps({"time": time.strftime("%Y-%m-%d %H:%M:%S"), "label": label, **r}) + "\n")
            print(
                f"  vs {r['b']:<28} {r['games']:5d} games  wins {r['win_rate']:6.1%} ± {r['win_ci']:.1%}"
                f"  margin {r['margin_per_hand']:+.2f} ± {r['margin_ci']:.2f} pts/hand  ({time.time() - started:.0f}s)",
                flush=True,
            )
    return results


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--a", required=True)
    p.add_argument("--vs", action="append", help="opponent[:games]; repeatable")
    p.add_argument("--workers", type=int, default=os.cpu_count() or 8)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--label", default="")
    args = p.parse_args()
    gauntlet(args.a, args.vs or DEFAULT_VS, args.workers, args.seed, args.label)


if __name__ == "__main__":
    main()
