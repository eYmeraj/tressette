"""Trains the Tressette bot's network on self-play data from `npm run selfplay`.

The network looks at one seat's view (src/engine/ml/encode.ts) and predicts, for every card, the score the teacher
gave it (the thirds our team ends the hand with minus theirs) relative to the average legal card. The bot then
plays the legal card it scores highest. Learning scores rather than only the chosen card tells the network how much
better one card is than another, which teaches it far more per position.

Tressette treats every suit alike, so each training example is shown with its suits randomly relabelled
(ml/perms-<players>p.json, from `npm run export-perms`): 24 versions of every position for free.

Safe to interrupt: a checkpoint is saved after every epoch (ml/checkpoints/), and rerunning the same command carries
on from it. --fresh starts over.

Usage (from ml/):  .venv/bin/python train.py --data 'data/2p-hard-*' --out ../src/engine/ml/weights-2p.json
"""

import argparse
import base64
import glob
import hashlib
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

Q_SCALE = 10.0  # scores are in thirds (about -35..35); the network predicts them divided by this
HERE = Path(__file__).resolve().parent


def load_runs(pattern: str):
    """Every run matching `pattern` (comma-separate several patterns), as (x, mask, q) per run."""
    paths = sorted({Path(p) for pat in pattern.split(",") for p in glob.glob(pat) if (Path(p) / "meta.json").exists()})
    if not paths:
        raise SystemExit(f"No runs match {pattern!r}")
    runs, meta = [], None
    for run in paths:
        meta = json.loads((run / "meta.json").read_text())
        n, f, a = meta["rows"], meta["features"], meta["actions"]
        # A run still being written may have more rows on disk than meta.json reports: keep only the counted ones.
        x = np.fromfile(run / "x.f32", dtype=np.float32, count=n * f).reshape(n, f)
        mask = np.fromfile(run / "mask.u8", dtype=np.uint8, count=n * a).reshape(n, a).astype(bool)
        q = np.fromfile(run / "q.f32", dtype=np.float32, count=n * a).reshape(n, a)
        # Only how the cards compare matters for choosing one, so learn each card's score relative to the average
        # legal card: the rest ("how good is this hand") is noise for this purpose.
        q = np.where(mask, q - (q * mask).sum(1, keepdims=True) / mask.sum(1, keepdims=True), 0).astype(np.float32)
        runs.append((run, x, mask, q))
    return runs, meta


def split(runs, val_pattern: str | None):
    """Validation is whole runs (so its hands never appear in training): those matching --val, else the last one."""
    if val_pattern:
        held = {Path(p) for pat in val_pattern.split(",") for p in glob.glob(pat)}
        val = [r for r in runs if r[0] in held]
        train = [r for r in runs if r[0] not in held]
    else:
        train, val = runs[:-1], runs[-1:]
    if not train or not val:
        raise SystemExit("Need at least one training run and one validation run")
    cat = lambda rs: tuple(np.concatenate([r[i] for r in rs]) for i in (1, 2, 3))
    for r in train:
        print(f"  train {r[0]}: {len(r[1])} rows")
    for r in val:
        print(f"  val   {r[0]}: {len(r[1])} rows")
    return cat(train), cat(val)


class QNet(nn.Module):
    def __init__(self, features: int, actions: int, hidden: int, layers: int):
        super().__init__()
        sizes = [features] + [hidden] * layers
        blocks = []
        for i, o in zip(sizes, sizes[1:]):
            blocks += [nn.Linear(i, o), nn.ReLU()]
        self.body = nn.Sequential(*blocks, nn.Linear(sizes[-1], actions))

    def forward(self, x):
        return self.body(x)


def evaluate(net, x, mask, q):
    """Loss, how often the network picks the teacher's card, and how much score its picks give up on average."""
    net.eval()
    losses, agree, regret = [], [], []
    with torch.no_grad():
        for i in range(0, len(x), 8192):
            xb, mb, qb = x[i : i + 8192], mask[i : i + 8192], q[i : i + 8192]
            pred = net(xb) * Q_SCALE
            losses.append(((((pred - qb) ** 2) * mb).sum() / mb.sum()).item() * len(xb))
            neg = torch.tensor(-1e9, device=x.device)
            pick = torch.where(mb, pred, neg).argmax(1)
            best = torch.where(mb, qb, neg)
            agree.append((pick == best.argmax(1)).float().sum().item())
            regret.append((best.max(1).values - qb.gather(1, pick[:, None])[:, 0]).sum().item())
    net.train()
    return sum(losses) / len(x), sum(agree) / len(x), sum(regret) / len(x)


def b64(a) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode()


def export(net: QNet, players: int, features: int, sample: np.ndarray, path: Path, info: dict):
    """Weights as base64 float32 for src/engine/ml/mlp.ts: each layer's weight row-major as [out][in], then bias.

    Also stores one input and the scores PyTorch gives it, so the TypeScript side can check it computes the same.
    Written to a temporary file and renamed, so an interruption never leaves a broken weights file.
    """
    net.eval()
    device = next(net.parameters()).device
    with torch.no_grad():
        expected = (net(torch.from_numpy(sample[None]).to(device)) * Q_SCALE)[0].cpu().numpy()
    layers = []
    for m in net.body:
        if isinstance(m, nn.Linear):
            w = m.weight.detach().cpu().numpy()
            layers.append({"in": w.shape[1], "out": w.shape[0], "w": b64(w), "b": b64(m.bias.detach().cpu().numpy())})
    check = {"x": b64(sample), "y": b64(expected)}
    weights = {"players": players, "features": features, "scale": Q_SCALE, "layers": layers, "check": check, "info": info}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(weights))
    os.replace(tmp, path)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")


def save_checkpoint(path: Path, state: dict):
    tmp = path.with_suffix(".tmp")
    torch.save(state, tmp)
    os.replace(tmp, path)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data/2p-hard-*", help="run directories (glob; comma-separate several)")
    p.add_argument("--val", default=None, help="runs held out for validation (glob); default: the last run")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--hidden", type=int, default=256)
    p.add_argument("--layers", type=int, default=2)
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=512)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--no-augment", action="store_true", help="don't relabel suits")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--fresh", action="store_true", help="ignore an existing checkpoint")
    args = p.parse_args()

    torch.manual_seed(args.seed)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print("loading")
    runs, meta = load_runs(args.data)
    (x, mask, q), (vx, vmask, vq) = split(runs, args.val)
    players, features = meta["players"], meta["features"]
    print(f"{len(x)} training rows, {len(vx)} validation rows, {features} features, on {device}")

    tx, tmask, tq = (torch.from_numpy(a).to(device) for a in (x, mask, q / Q_SCALE))
    val = tuple(torch.from_numpy(a).to(device) for a in (vx, vmask, vq))
    perms = json.loads((HERE / f"perms-{players}p.json").read_text())
    # Data recorded before newer (later) feature blocks existed uses a prefix of the layout; its maps stay within it.
    fmap = torch.tensor([m["features"][:features] for m in perms["maps"]], device=device)
    amap = torch.tensor([m["actions"] for m in perms["maps"]], device=device)

    net = QNet(features, mask.shape[1], args.hidden, args.layers).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)

    # The checkpoint belongs to these exact settings and data; anything else starts over.
    settings = {k: v for k, v in vars(args).items() if k not in ("fresh",)} | {"rows": len(x), "out": str(args.out)}
    key = hashlib.sha1(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:10]
    ckpt_dir = HERE / "checkpoints"
    ckpt_dir.mkdir(exist_ok=True)
    ckpt = ckpt_dir / f"{args.out.stem}-{key}.pt"
    start, best_regret, best_state, history = 0, float("inf"), None, []
    if ckpt.exists() and not args.fresh:
        state = torch.load(ckpt, map_location=device, weights_only=False)
        net.load_state_dict(state["net"])
        opt.load_state_dict(state["opt"])
        sched.load_state_dict(state["sched"])
        start, best_regret, best_state, history = state["epoch"], state["best_regret"], state["best_state"], state["history"]
        print(f"resuming {ckpt.name} after epoch {start}")

    for epoch in range(start, args.epochs):
        started = time.time()
        # Each epoch's order and suit relabelling come from its own seed, so a resumed run matches an uninterrupted one.
        g = torch.Generator().manual_seed(args.seed * 1000 + epoch)
        order = torch.randperm(len(tx), generator=g).to(device)
        perm_of = torch.randint(0, len(fmap), (len(tx),), generator=g).to(device)
        total = 0.0
        for i in range(0, len(order), args.batch):
            idx = order[i : i + args.batch]
            xb, mb, qb = tx[idx], tmask[idx], tq[idx]
            if not args.no_augment:
                k = perm_of[i : i + args.batch]
                xb = xb.gather(1, fmap[k])
                mb = mb.gather(1, amap[k])
                qb = qb.gather(1, amap[k])
            # Only legal cards have a score to learn.
            loss = (((net(xb) - qb) ** 2) * mb).sum() / mb.sum()
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        sched.step()
        vloss, agree, regret = evaluate(net, *val)
        history.append({"epoch": epoch + 1, "train": total / len(tx) * Q_SCALE**2, "val": vloss, "agree": agree, "regret": regret})
        print(
            f"epoch {epoch + 1:2d}  train {total / len(tx) * Q_SCALE**2:6.2f}  val {vloss:6.2f}  "
            f"same card {agree:.1%}  regret {regret:.3f} thirds  ({time.time() - started:.1f}s)",
            flush=True,
        )
        if regret < best_regret:
            best_regret, best_state = regret, {k: v.detach().clone() for k, v in net.state_dict().items()}
        save_checkpoint(ckpt, {
            "net": net.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(),
            "epoch": epoch + 1, "best_regret": best_regret, "best_state": best_state, "history": history,
        })

    net.load_state_dict(best_state)
    print(f"best validation regret {best_regret:.3f} thirds")
    info = {"settings": settings, "best_regret": best_regret, "history": history}
    export(net, players, features, vx[0], args.out, info)


if __name__ == "__main__":
    main()
