"""Starts a long job that keeps running if this terminal (or the Claude Code session) goes away.

The job gets its own process session, so closing the terminal doesn't signal it, and its output goes to a log.
Its process id is written next to the log, so it can be found again (`kill $(cat ml/logs/x.pid)` stops it).

Usage (from the project root):
  ml/.venv/bin/python ml/detach.py ml/logs/loop.log -- ml/.venv/bin/python ml/loop.py
"""

import subprocess
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 4 or sys.argv[2] != "--":
        raise SystemExit(__doc__)
    log = Path(sys.argv[1])
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a") as out:
        proc = subprocess.Popen(sys.argv[3:], stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    log.with_suffix(".pid").write_text(f"{proc.pid}\n")
    print(f"started {proc.pid}, logging to {log}")


if __name__ == "__main__":
    main()
