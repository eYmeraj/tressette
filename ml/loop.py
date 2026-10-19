"""Expert iteration: the network teaches the search, the search teaches the next network.

Each generation:
  1. generate  the best network guides the search (search:<best>), which plays every seat of new self-play hands
               and scores every card (npm run selfplay, one process per core)
  2. train     a new network on the latest generations' data (train.py, from scratch)
  3. gate      the new network plays the best one head to head (gauntlet.py); it becomes the best only if it
               scores more points per hand
Then the next generation starts from whichever network is best.

Safe to interrupt at any point: ml/loop/state.json records the finished stages, self-play and training resume from
their own files, so rerunning the same command carries on where it stopped. Run it detached so it outlives the
terminal:

  ml/.venv/bin/python ml/detach.py ml/logs/loop.log -- caffeinate -i ml/.venv/bin/python ml/loop.py --generations 6

(`caffeinate -i` keeps the Mac from sleeping while it runs.) Stop it, with everything it started, by signalling its
process group: `kill -- -$(cat ml/logs/loop.pid)` (the loop then kills its self-play processes, which ignore SIGTERM). If it is killed some other way, the next start stops any
self-play still writing its runs before resuming them, so a run never has two writers.
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from gauntlet import gauntlet

ROOT = Path(__file__).resolve().parent.parent
ML = ROOT / "ml"
LOOP = ML / "loop"
STATE = LOOP / "state.json"


def log(msg: str):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def load_state(args) -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"best": args.start, "generation": 0, "stage": "generate", "history": []}


def save_state(state: dict):
    LOOP.mkdir(exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    os.replace(tmp, STATE)


children: list[subprocess.Popen] = []


def stop_children(*_):
    # npm/vite-node ignore SIGTERM, so kill outright: self-play and training both resume from their last save.
    for p in children:
        if p.poll() is None:
            p.kill()
    subprocess.run(["pkill", "-9", "-f", "--", "--out ml/data/gen-"], cwd=ROOT)
    sys.exit(1)


def generate(gen: int, best: str, args) -> list[str]:
    """One self-play run per worker, resumed if they already started; returns their directories."""
    teacher = f"search:{best},samples={args.samples}"
    runs = [f"ml/data/gen-{gen:02d}-{k}" for k in range(1, args.workers + 1)]
    log(f"gen {gen}: generating {args.hands} hands x {args.workers} with {teacher}")
    for out in runs:
        # A self-play left over from a loop that was killed: stop it, the new one resumes its run.
        subprocess.run(["pkill", "-9", "-f", "--", f"--out {out} --hands"], cwd=ROOT)
    procs = []
    for k, out in enumerate(runs, 1):
        cmd = ["npx", "vite-node", "scripts/selfplay.ts", "--", "--out", out, "--hands", str(args.hands),
               "--teacher", teacher, "--seed", str(gen * 1000 + k)]
        logf = (ML / "logs" / f"gen-{gen:02d}-{k}.log").open("a")
        procs.append(subprocess.Popen(cmd, cwd=ROOT, stdout=logf, stderr=subprocess.STDOUT))
    children.extend(procs)
    for p in procs:
        if p.wait():
            raise RuntimeError(f"self-play failed: {' '.join(p.args)} (see ml/logs/gen-{gen:02d}-*.log)")
    return runs


def train(gen: int, args) -> str:
    """Trains on the last `window` generations (plus the original Hard data if asked), validated on this one's last run."""
    first = max(1, gen - args.window + 1)
    patterns = [f"data/gen-{g:02d}-*" for g in range(first, gen + 1)] + (["data/2p-hard-*"] if args.keep_hard else [])
    out = f"models/gen-{gen:02d}.json"
    cmd = [sys.executable, "train.py", "--data", ",".join(patterns), "--val", f"data/gen-{gen:02d}-{args.workers}",
           "--out", out, "--epochs", str(args.epochs), "--hidden", str(args.hidden), "--layers", str(args.layers)]
    log(f"gen {gen}: training {out} on {', '.join(patterns)}")
    with (ML / "logs" / f"train-gen-{gen:02d}.log").open("a") as logf:
        p = subprocess.Popen(cmd, cwd=ML, stdout=logf, stderr=subprocess.STDOUT)
        children.append(p)
        if p.wait():
            raise RuntimeError(f"training failed (see ml/logs/train-gen-{gen:02d}.log)")
    return f"ml/{out}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="src/engine/ml/weights-2p.json", help="network that starts as the best")
    p.add_argument("--generations", type=int, default=6, help="stop after this generation")
    p.add_argument("--hands", type=int, default=300, help="self-play hands per worker per generation")
    p.add_argument("--samples", type=int, default=40, help="imagined deals per move for the teacher's search")
    p.add_argument("--workers", type=int, default=os.cpu_count() or 8)
    p.add_argument("--window", type=int, default=3, help="train on this many latest generations")
    p.add_argument("--keep-hard", action="store_true", help="also train on the original Stats-bot data")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--hidden", type=int, default=256)
    p.add_argument("--layers", type=int, default=2)
    p.add_argument("--gate-games", type=int, default=4000)
    args = p.parse_args()

    signal.signal(signal.SIGTERM, stop_children)
    (ML / "logs").mkdir(exist_ok=True)
    state = load_state(args)
    log(f"state: generation {state['generation']}, stage {state['stage']}, best {state['best']}")

    while True:
        if state["stage"] == "next":
            if state["generation"] >= args.generations:
                log("done")
                return
            state.update(generation=state["generation"] + 1, stage="generate", candidate=None)
            save_state(state)
        gen = state["generation"] or 1
        state["generation"] = gen

        if state["stage"] == "generate":
            generate(gen, state["best"], args)
            state["stage"] = "train"
            save_state(state)

        if state["stage"] == "train":
            state["candidate"] = train(gen, args)
            state["stage"] = "gate"
            save_state(state)

        if state["stage"] == "gate":
            cand, best = state["candidate"], state["best"]
            log(f"gen {gen}: gating {cand} against {best}")
            [r] = gauntlet(f"neural:{cand}", [f"neural:{best}:{args.gate_games}"], label=f"loop gen {gen} gate")
            promoted = r["margin_per_hand"] > 0 and r["win_rate"] > 0.5
            state["history"].append({"generation": gen, "candidate": cand, "against": best, "promoted": promoted,
                                     "win_rate": r["win_rate"], "margin_per_hand": r["margin_per_hand"], "margin_ci": r["margin_ci"]})
            if promoted:
                state["best"] = cand
            log(f"gen {gen}: {'promoted' if promoted else 'kept'} ({r['margin_per_hand']:+.3f} ± {r['margin_ci']:.3f} pts/hand); best is {state['best']}")
            state["stage"] = "next"
            save_state(state)


if __name__ == "__main__":
    main()
