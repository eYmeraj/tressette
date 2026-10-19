#!/usr/bin/env bash
# Trains one model per line of "name args..." from stdin into models/<name>.json, logs in logs/train-<name>.log.
# Safe to rerun after an interruption: train.py resumes each from its checkpoint, finished ones are skipped.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p models logs
while read -r name args; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  if [[ ! -f "models/$name.json" ]]; then
    # shellcheck disable=SC2086
    .venv/bin/python train.py --out "models/$name.json" $args >> "logs/train-$name.log" 2>&1
  fi
  echo "$name: $(grep 'best validation' "logs/train-$name.log" | tail -1) | $(grep '^epoch' "logs/train-$name.log" | tail -1 | cut -c1-56)"
done
